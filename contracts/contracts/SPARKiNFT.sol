// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC7857} from "./interfaces/IERC7857.sol";
import {IERC7857Authorize} from "./interfaces/IERC7857Authorize.sol";
import {IntelligentData} from "./interfaces/IERC7857Metadata.sol";
import {
    IERC7857DataVerifier,
    TransferValidityProof,
    TransferValidityProofOutput
} from "./interfaces/IERC7857DataVerifier.sol";

/// @title SPARKiNFT — ERC-7857 Intelligent NFT for SPARK AI Agent Identity
/// @notice Each SPARK bot mints an iNFT on registration. The iNFT carries
///         the agent's on-chain identity, encrypted AI profile, domain expertise,
///         service offerings, and reputation data.
/// @dev Non-upgradeable simplified version for hackathon demo.
///      Uses the real ERC-7857 interface from the 0g-agent-nft reference impl.
contract SPARKiNFT is ERC721, Ownable {
    IERC7857DataVerifier public verifier;
    mapping(address => address) private _accessAssistants;
    mapping(uint256 => IntelligentData[]) private _iDatas;
    mapping(uint256 => mapping(address => bool)) private _authorized;
    mapping(uint256 => address[]) private _authorizedUsers;

    struct AgentProfile {
        string botId;
        string domainTags;
        string serviceOfferings;
        uint256 reputationScore;
        uint256 contributionCount;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(uint256 => AgentProfile) private _profiles;
    uint256 private _nextTokenId = 1;

    event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);
    event PublishedSealedKey(address indexed to, uint256 indexed tokenId, bytes[] sealedKeys);
    event DelegateAccess(address indexed user, address indexed assistant);
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);
    event AgentMinted(uint256 indexed tokenId, address indexed owner, string botId);
    event AgentProfileUpdated(uint256 indexed tokenId, string domainTags, string serviceOfferings);
    event ContributionRecorded(uint256 indexed tokenId, uint256 newCount);

    constructor(
        address _verifier
    ) ERC721("SPARK iNFT Agent", "SPARK") Ownable(msg.sender) {
        verifier = IERC7857DataVerifier(_verifier);
    }

    function mintAgent(
        address to,
        string calldata botId,
        string calldata domainTags,
        string calldata serviceOfferings,
        IntelligentData[] calldata iDatas
    ) external returns (uint256) {
        require(to != address(0), "Zero address");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        for (uint i = 0; i < iDatas.length; i++) {
            _iDatas[tokenId].push(iDatas[i]);
        }

        _profiles[tokenId] = AgentProfile({
            botId: botId,
            domainTags: domainTags,
            serviceOfferings: serviceOfferings,
            reputationScore: 0,
            contributionCount: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit AgentMinted(tokenId, to, botId);
        return tokenId;
    }

    function iTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) external {
        require(ownerOf(tokenId) == from, "Not owner");
        require(to != address(0), "Invalid recipient");
        require(proofs.length > 0, "Empty proofs");

        TransferValidityProofOutput[] memory outputs = verifier.verifyTransferValidity(proofs);
        require(outputs.length == _iDatas[tokenId].length, "Proof count mismatch");

        bytes[] memory sealedKeys = new bytes[](outputs.length);
        for (uint i = 0; i < outputs.length; i++) {
            require(outputs[i].dataHash == _iDatas[tokenId][i].dataHash, "Data hash mismatch");
            sealedKeys[i] = outputs[i].sealedKey;
        }

        _transfer(from, to, tokenId);

        emit PublishedSealedKey(to, tokenId, sealedKeys);
    }

    function updateData(uint256 tokenId, IntelligentData[] calldata newDatas) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(newDatas.length > 0, "Empty data");

        IntelligentData[] memory oldDatas = _iDatas[tokenId];

        delete _iDatas[tokenId];
        for (uint i = 0; i < newDatas.length; i++) {
            _iDatas[tokenId].push(newDatas[i]);
        }

        _profiles[tokenId].updatedAt = block.timestamp;
        emit Updated(tokenId, oldDatas, newDatas);
    }

    function intelligentDatasOf(uint256 tokenId) external view returns (IntelligentData[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _iDatas[tokenId];
    }

    function delegateAccess(address assistant) external {
        _accessAssistants[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function getDelegateAccess(address user) external view returns (address) {
        return _accessAssistants[user];
    }

    function authorizeUsage(uint256 tokenId, address user) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(user != address(0), "Zero address");
        require(!_authorized[tokenId][user], "Already authorized");

        _authorized[tokenId][user] = true;
        _authorizedUsers[tokenId].push(user);

        emit Authorization(msg.sender, user, tokenId);
    }

    function revokeAuthorization(uint256 tokenId, address user) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(_authorized[tokenId][user], "Not authorized");

        _authorized[tokenId][user] = false;

        address[] storage users = _authorizedUsers[tokenId];
        for (uint i = 0; i < users.length; i++) {
            if (users[i] == user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }

        emit AuthorizationRevoked(msg.sender, user, tokenId);
    }

    function authorizedUsersOf(uint256 tokenId) external view returns (address[] memory) {
        return _authorizedUsers[tokenId];
    }

    function isAuthorized(uint256 tokenId, address user) external view returns (bool) {
        return _authorized[tokenId][user];
    }

    function updateProfile(
        uint256 tokenId,
        string calldata domainTags,
        string calldata serviceOfferings
    ) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        AgentProfile storage p = _profiles[tokenId];
        p.domainTags = domainTags;
        p.serviceOfferings = serviceOfferings;
        p.updatedAt = block.timestamp;
        emit AgentProfileUpdated(tokenId, domainTags, serviceOfferings);
    }

    function recordContribution(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        _profiles[tokenId].contributionCount++;
        _profiles[tokenId].updatedAt = block.timestamp;
        emit ContributionRecorded(tokenId, _profiles[tokenId].contributionCount);
    }

    function updateReputation(uint256 tokenId, uint256 newScore) external onlyOwner {
        _profiles[tokenId].reputationScore = newScore;
        _profiles[tokenId].updatedAt = block.timestamp;
    }

    function getAgentProfile(uint256 tokenId) external view returns (AgentProfile memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _profiles[tokenId];
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        IntelligentData[] storage datas = _iDatas[tokenId];
        if (datas.length > 0 && bytes(datas[0].dataDescription).length > 0) {
            return datas[0].dataDescription;
        }
        return "";
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(IERC7857).interfaceId ||
            interfaceId == type(IERC7857Authorize).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
