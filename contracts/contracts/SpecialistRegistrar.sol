// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external;

    function isApprovedForAll(address account, address operator) external view returns (bool);
}

interface IPublicResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

/// @title SpecialistRegistrar
/// @notice Lets any wallet register a wrapped ENS subname under a parent
///         domain that has approved this contract on NameWrapper. The caller
///         pays gas; this contract mints the subname to itself, writes the
///         specialist text records on the resolver, and transfers the wrapped
///         ERC1155 token to the caller — all in a single transaction.
contract SpecialistRegistrar {
    INameWrapper public immutable nameWrapper;
    IPublicResolver public immutable resolver;
    bytes32 public immutable parentNode;

    string public constant KEY_AXL_PUBKEY    = "axl_pubkey";
    string public constant KEY_SKILLS        = "skills";
    string public constant KEY_WORKSPACE_URI = "0g_workspace_uri";
    string public constant KEY_TOKEN_ID      = "0g_token_id";
    string public constant KEY_PRICE         = "price";
    string public constant KEY_VERSION       = "version";

    struct Records {
        string axlPubkey;
        string skills;
        string workspaceUri;
        string tokenId;
        string price;
        string version;
    }

    /// @notice One row of the per-owner registration log.
    struct Registration {
        string  label;
        bytes32 node;
    }

    /// @dev Per-address list of every specialist this contract minted on
    /// behalf of `msg.sender`. This is a *registration history*, not a
    /// live ownership view — if the wrapped ERC1155 token is transferred
    /// elsewhere later, the entry stays in this list. (The registrar can't
    /// observe NameWrapper transfers, so live tracking would need a custom
    /// token contract.)
    mapping(address => Registration[]) private _ownedByCaller;

    event SpecialistRegistered(
        bytes32 indexed node,
        address indexed owner,
        string label
    );

    error InvalidLabel();
    error RegistrarNotApproved();

    constructor(address _nameWrapper, address _resolver, bytes32 _parentNode) {
        nameWrapper = INameWrapper(_nameWrapper);
        resolver = IPublicResolver(_resolver);
        parentNode = _parentNode;
    }

    function register(string calldata label, Records calldata records)
        external
        returns (bytes32 node)
    {
        _validateLabel(label);

        (address parentOwner, , uint64 parentExpiry) = nameWrapper.getData(uint256(parentNode));
        if (!nameWrapper.isApprovedForAll(parentOwner, address(this))) {
            revert RegistrarNotApproved();
        }

        // Mint the wrapped subname owned by this contract. Inheriting the
        // parent's expiry sidesteps any clamping the wrapper would do.
        node = nameWrapper.setSubnodeRecord(
            parentNode,
            label,
            address(this),
            address(resolver),
            0,
            0,
            parentExpiry
        );

        // Write text records. This contract is the subname owner, so the
        // resolver's auth check (msg.sender == owner) passes.
        resolver.setText(node, KEY_AXL_PUBKEY,    records.axlPubkey);
        resolver.setText(node, KEY_SKILLS,        records.skills);
        resolver.setText(node, KEY_WORKSPACE_URI, records.workspaceUri);
        resolver.setText(node, KEY_TOKEN_ID,      records.tokenId);
        resolver.setText(node, KEY_PRICE,         records.price);
        resolver.setText(node, KEY_VERSION,       records.version);

        // Hand the wrapped token to the caller.
        nameWrapper.safeTransferFrom(address(this), msg.sender, uint256(node), 1, "");

        // Record into the caller's registration log so the frontend can
        // discover it with a single view call (no event-log scan needed).
        _ownedByCaller[msg.sender].push(Registration({ label: label, node: node }));

        emit SpecialistRegistered(node, msg.sender, label);
    }

    /// @notice Every specialist `owner` has ever registered through this
    /// contract, in chronological order (oldest first). See the comment on
    /// `_ownedByCaller` — this is registration history, not current ownership.
    function getOwned(address owner) external view returns (Registration[] memory) {
        return _ownedByCaller[owner];
    }

    /// @notice Number of registrations attributed to `owner`.
    function ownedCount(address owner) external view returns (uint256) {
        return _ownedByCaller[owner].length;
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

    // ─── Label validation: 3-63 chars, lowercase letters / digits / hyphens ─
    function _validateLabel(string calldata label) internal pure {
        bytes memory b = bytes(label);
        uint256 len = b.length;
        if (len < 3 || len > 63) revert InvalidLabel();
        for (uint256 i; i < len; ++i) {
            bytes1 c = b[i];
            bool ok =
                (c >= 0x61 && c <= 0x7A) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                c == 0x2D;                  // -
            if (!ok) revert InvalidLabel();
        }
    }
}
