// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Metadata} from "@openzeppelin/contracts/interfaces/IERC721Metadata.sol";

struct IntelligentData {
    string dataDescription;
    bytes32 dataHash;
}

interface IERC7857Metadata is IERC721Metadata {
    /// @notice Get the intelligent data of a token
    /// @param _tokenId The token identifier
    /// @return The current intelligent data of the token
    function intelligentDatasOf(uint256 _tokenId) external view returns (IntelligentData[] memory);
}
