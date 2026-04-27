// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC7857DataVerifier, TransferValidityProof} from "./IERC7857DataVerifier.sol";
import {IERC721} from "@openzeppelin/contracts/interfaces/IERC721.sol";
import {IERC7857Metadata, IntelligentData} from "./IERC7857Metadata.sol";

interface IERC7857 is IERC721, IERC7857Metadata {
    error ERC7857InvalidAssistant(address);
    error ERC7857EmptyProof();
    error ERC7857ProofCountMismatch();
    error ERC7857DataHashMismatch();
    error ERC7857AccessAssistantMismatch();
    error ERC7857WantedReceiverMismatch();
    error ERC7857TargetPubkeyMismatch();

    event Updated(uint256 indexed _tokenId, IntelligentData[] _oldDatas, IntelligentData[] _newDatas);
    event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys);
    event DelegateAccess(address indexed _user, address indexed _assistant);

    function verifier() external view returns (IERC7857DataVerifier);

    function iTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;

    function delegateAccess(address _assistant) external;
    function getDelegateAccess(address _user) external view returns (address);
}
