// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

interface INameWrapper {
    function setSubnodeRecord(
        bytes32 parentNode,
        string calldata label,
        address owner,
        address resolver,
        uint64 ttl,
        uint32 fuses,
        uint64 expiry
    ) external returns (bytes32);

    function getData(uint256 id)
        external
        view
        returns (address owner, uint32 fuses, uint64 expiry);

    function isApprovedForAll(address account, address operator) external view returns (bool);

    function isWrapped(bytes32 node) external view returns (bool);
}

interface IPublicResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

/// @title TaskMarket
/// @notice Escrow-based task board where every task is also a wrapped ENS
///         subname `task-{id}.{parent}` with text records describing it.
///         The contract owns the subname for the task's lifetime so it can
///         update the `status` record on complete / cancel. Caller pays gas;
///         budget is locked in escrow at post time and split equally among
///         signed-on specialists at complete time (pull-pattern withdrawal).
contract TaskMarket {
    INameWrapper public immutable nameWrapper;
    IPublicResolver public immutable resolver;
    bytes32 public immutable parentNode;

    enum Status { Open, Completed, Cancelled }

    struct Task {
        address creator;
        string description;
        string skillTags;       // comma-separated, mirrors ENS `skills` record
        uint256 budget;
        uint64 deadline;
        uint8 maxSpecialists;
        Status status;
        bytes32 ensNode;        // namehash of task-{id}.{parent}
    }

    Task[] internal _tasks;
    mapping(uint256 => address[]) internal _specialists;
    mapping(uint256 => mapping(address => bool)) public hasSignedOn;
    mapping(address => uint256) public withdrawable;

    event TaskPosted(
        uint256 indexed taskId,
        address indexed creator,
        bytes32 indexed ensNode,
        string label
    );
    event SpecialistSignedOn(uint256 indexed taskId, address indexed specialist);
    event TaskCompleted(uint256 indexed taskId, uint256 perSpecialistPayout);
    event TaskCancelled(uint256 indexed taskId);
    event Withdrawal(address indexed who, uint256 amount);

    error EmptyDescription();
    error DeadlineInPast();
    error InvalidMaxSpecialists();
    error NoBudget();
    error TaskNotOpen();
    error TaskFull();
    error DeadlinePassed();
    error AlreadySignedOn();
    error NotCreator();
    error NoSpecialists();
    error HasSpecialists();
    error NothingToWithdraw();
    error TransferFailed();
    error RegistrarNotApproved();
    error LabelAlreadyTaken();

    constructor(address _nameWrapper, address _resolver, bytes32 _parentNode) {
        nameWrapper = INameWrapper(_nameWrapper);
        resolver = IPublicResolver(_resolver);
        parentNode = _parentNode;
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    function postTask(
        string calldata description,
        string calldata skillTags,
        uint64 deadline,
        uint8 maxSpecialists
    ) external payable returns (uint256 taskId, bytes32 ensNode) {
        if (bytes(description).length == 0) revert EmptyDescription();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (maxSpecialists == 0) revert InvalidMaxSpecialists();
        if (msg.value == 0) revert NoBudget();

        (address parentOwner, , uint64 parentExpiry) =
            nameWrapper.getData(uint256(parentNode));
        if (!nameWrapper.isApprovedForAll(parentOwner, address(this))) {
            revert RegistrarNotApproved();
        }

        taskId = _tasks.length;
        string memory label = string.concat("task-", Strings.toString(taskId));
        bytes32 expectedNode = keccak256(
            abi.encodePacked(parentNode, keccak256(bytes(label)))
        );
        if (nameWrapper.isWrapped(expectedNode)) revert LabelAlreadyTaken();

        // Mint the wrapped subname owned by this contract. Inheriting the
        // parent's expiry sidesteps any clamping the wrapper would do.
        ensNode = nameWrapper.setSubnodeRecord(
            parentNode,
            label,
            address(this),
            address(resolver),
            0,
            0,
            parentExpiry
        );

        // Write descriptive records. Contract is the subname owner, so the
        // resolver's auth check passes.
        resolver.setText(ensNode, "description", description);
        resolver.setText(ensNode, "skills", skillTags);
        resolver.setText(ensNode, "budget", Strings.toString(msg.value));
        resolver.setText(ensNode, "deadline", Strings.toString(uint256(deadline)));
        resolver.setText(
            ensNode,
            "creator",
            Strings.toHexString(uint256(uint160(msg.sender)), 20)
        );
        resolver.setText(ensNode, "status", "open");

        _tasks.push(Task({
            creator: msg.sender,
            description: description,
            skillTags: skillTags,
            budget: msg.value,
            deadline: deadline,
            maxSpecialists: maxSpecialists,
            status: Status.Open,
            ensNode: ensNode
        }));

        emit TaskPosted(taskId, msg.sender, ensNode, label);
    }

    function signOn(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Open) revert TaskNotOpen();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        address[] storage specs = _specialists[taskId];
        if (specs.length >= t.maxSpecialists) revert TaskFull();
        if (hasSignedOn[taskId][msg.sender]) revert AlreadySignedOn();

        hasSignedOn[taskId][msg.sender] = true;
        specs.push(msg.sender);

        emit SpecialistSignedOn(taskId, msg.sender);
    }

    function completeTask(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (t.creator != msg.sender) revert NotCreator();
        if (t.status != Status.Open) revert TaskNotOpen();
        address[] storage specs = _specialists[taskId];
        uint256 n = specs.length;
        if (n == 0) revert NoSpecialists();

        t.status = Status.Completed;
        uint256 share = t.budget / n;
        for (uint256 i; i < n; ++i) {
            withdrawable[specs[i]] += share;
        }
        uint256 dust = t.budget - share * n;
        if (dust > 0) withdrawable[t.creator] += dust;

        resolver.setText(t.ensNode, "status", "completed");

        emit TaskCompleted(taskId, share);
    }

    function cancelTask(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (t.creator != msg.sender) revert NotCreator();
        if (t.status != Status.Open) revert TaskNotOpen();
        if (_specialists[taskId].length > 0) revert HasSpecialists();

        t.status = Status.Cancelled;
        withdrawable[t.creator] += t.budget;

        resolver.setText(t.ensNode, "status", "cancelled");

        emit TaskCancelled(taskId);
    }

    function withdraw() external {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // ─── ERC1155 receiver hooks (needed to accept the freshly minted token) ─

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x4e2312e0;   // ERC1155Receiver
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    function getTaskSpecialists(uint256 taskId) external view returns (address[] memory) {
        return _specialists[taskId];
    }

    function tasksCount() external view returns (uint256) {
        return _tasks.length;
    }

    function taskLabel(uint256 taskId) external pure returns (string memory) {
        return string.concat("task-", Strings.toString(taskId));
    }
}
