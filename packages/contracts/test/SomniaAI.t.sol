// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SomniaAI} from "../src/agents/lib/SomniaAI.sol";
import {IJsonApiAgent, ILlmAgent, SomniaAgentIds} from "../src/agents/lib/SomniaAgents.sol";

contract SomniaAITest is Test {
    function _selector(bytes memory payload) internal pure returns (bytes4 s) {
        assembly {
            s := mload(add(payload, 0x20))
        }
    }

    // --- JSON encoders: pin signature + round-trip args ----------------------

    function test_encodeFetchUint_pinsSignatureAndArgs() public pure {
        bytes memory p = SomniaAI.encodeFetchUint("https://api.x/p", "a.b", 8);
        // signature pinned independently of the interface declaration
        assertEq(_selector(p), bytes4(keccak256("fetchUint(string,string,uint8)")), "selector");
        assertEq(_selector(p), IJsonApiAgent.fetchUint.selector, "matches interface");
        // exact bytes match the canonical encoding
        assertEq(p, abi.encodeWithSelector(IJsonApiAgent.fetchUint.selector, "https://api.x/p", "a.b", uint8(8)));
    }

    function test_encodeFetchInt_pinsSignature() public pure {
        bytes memory p = SomniaAI.encodeFetchInt("u", "s", 2);
        assertEq(_selector(p), bytes4(keccak256("fetchInt(string,string,uint8)")));
    }

    function test_encodeFetchString_pinsSignature() public pure {
        bytes memory p = SomniaAI.encodeFetchString("u", "s");
        assertEq(_selector(p), bytes4(keccak256("fetchString(string,string)")));
    }

    function test_encodeFetchBool_pinsSignature() public pure {
        bytes memory p = SomniaAI.encodeFetchBool("u", "s");
        assertEq(_selector(p), bytes4(keccak256("fetchBool(string,string)")));
    }

    // --- LLM encoders --------------------------------------------------------

    function test_encodeInferString_pinsSignatureAndArgs() public pure {
        string[] memory allowed = new string[](2);
        allowed[0] = "accept";
        allowed[1] = "reject";
        bytes memory p = SomniaAI.encodeInferString("judge this", "you are a referee", false, allowed);
        assertEq(_selector(p), bytes4(keccak256("inferString(string,string,bool,string[])")));
        assertEq(
            p, abi.encodeWithSelector(ILlmAgent.inferString.selector, "judge this", "you are a referee", false, allowed)
        );
    }

    function test_encodeInferNumber_pinsSignature() public pure {
        bytes memory p = SomniaAI.encodeInferNumber("score it", "rubric", int256(0), int256(100), true);
        assertEq(_selector(p), bytes4(keccak256("inferNumber(string,string,int256,int256,bool)")));
    }

    // --- Consistency with the live OracleAgent payload format ----------------

    /// OracleAgent builds its payload as abi.encodeWithSelector(fetchUint.selector,url,path,decimals).
    /// The toolkit MUST produce byte-identical output so it's a drop-in for the live pattern.
    function test_encodeFetchUint_matchesOracleAgentFormat() public pure {
        string memory url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
        bytes memory fromLib = SomniaAI.encodeFetchUint(url, "bitcoin.usd", 8);
        bytes memory oracleFormat =
            abi.encodeWithSelector(IJsonApiAgent.fetchUint.selector, url, "bitcoin.usd", uint8(8));
        assertEq(fromLib, oracleFormat);
    }

    // --- Canonical IDs / platform addresses ----------------------------------

    function test_agentIds() public pure {
        assertEq(SomniaAgentIds.JSON_API, 13174292974160097713);
        assertEq(SomniaAgentIds.PARSE_WEBSITE, 12875401142070969085);
        assertEq(SomniaAgentIds.PLATFORM_TESTNET, 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);
        assertEq(SomniaAgentIds.PLATFORM_MAINNET, 0x5E5205CF39E766118C01636bED000A54D93163E6);
    }
}
