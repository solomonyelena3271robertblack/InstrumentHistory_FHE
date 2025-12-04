// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract InstrumentHistory_FHE is SepoliaConfig {
    struct EncryptedInstrument {
        uint256 instrumentId;
        euint32 encryptedMaterial;
        euint32 encryptedAge;
        euint32 encryptedDimensions;
        euint32 encryptedAcousticProfile;
        uint256 timestamp;
    }

    struct AcousticAnalysis {
        euint32 encryptedResonanceScore;
        euint32 encryptedHarmonicity;
        euint32 encryptedTimbreMatch;
        bool isCompleted;
        bool isRevealed;
    }

    struct StructuralAnalysis {
        euint32 encryptedIntegrityScore;
        euint32 encryptedMaterialConsistency;
        bool isCompleted;
        bool isRevealed;
    }

    struct DecryptedResult {
        uint32 resonanceScore;
        uint32 harmonicity;
        uint32 timbreMatch;
        uint32 integrityScore;
        uint32 materialConsistency;
        bool isRevealed;
    }

    mapping(address => EncryptedInstrument[]) public instruments;
    mapping(address => AcousticAnalysis[]) public acousticAnalyses;
    mapping(address => StructuralAnalysis[]) public structuralAnalyses;
    mapping(address => DecryptedResult[]) public decryptedResults;
    
    uint256 public instrumentCount;
    uint256 public analysisCount;
    address public admin;
    mapping(address => bool) public authorizedResearchers;
    
    event ResearcherAdded(address indexed researcher);
    event InstrumentRegistered(address indexed researcher, uint256 instrumentId);
    event AnalysisRequested(address indexed researcher, uint256 analysisId);
    event AnalysisCompleted(address indexed researcher, uint256 analysisId);
    event ResultRevealed(address indexed researcher, uint256 resultId);

    constructor() {
        admin = msg.sender;
        authorizedResearchers[admin] = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    modifier onlyResearcher() {
        require(authorizedResearchers[msg.sender], "Unauthorized researcher");
        _;
    }

    function addResearcher(address researcher) public onlyAdmin {
        authorizedResearchers[researcher] = true;
        emit ResearcherAdded(researcher);
    }

    function registerInstrument(
        euint32 material,
        euint32 age,
        euint32 dimensions,
        euint32 acousticProfile
    ) public onlyResearcher {
        instrumentCount++;
        instruments[msg.sender].push(EncryptedInstrument({
            instrumentId: instrumentCount,
            encryptedMaterial: material,
            encryptedAge: age,
            encryptedDimensions: dimensions,
            encryptedAcousticProfile: acousticProfile,
            timestamp: block.timestamp
        }));
        emit InstrumentRegistered(msg.sender, instrumentCount);
    }

    function requestAnalysis() public onlyResearcher returns (uint256) {
        analysisCount++;
        uint256 analysisId = analysisCount;
        
        acousticAnalyses[msg.sender].push(AcousticAnalysis({
            encryptedResonanceScore: FHE.asEuint32(0),
            encryptedHarmonicity: FHE.asEuint32(0),
            encryptedTimbreMatch: FHE.asEuint32(0),
            isCompleted: false,
            isRevealed: false
        }));
        
        structuralAnalyses[msg.sender].push(StructuralAnalysis({
            encryptedIntegrityScore: FHE.asEuint32(0),
            encryptedMaterialConsistency: FHE.asEuint32(0),
            isCompleted: false,
            isRevealed: false
        }));
        
        emit AnalysisRequested(msg.sender, analysisId);
        return analysisId;
    }

    function performAcousticAnalysis(uint256 analysisId) public onlyResearcher {
        require(analysisId <= analysisCount, "Invalid analysis ID");
        require(!acousticAnalyses[msg.sender][analysisId-1].isCompleted, "Already analyzed");
        
        EncryptedInstrument[] storage inst = instruments[msg.sender];
        euint32 totalResonance = FHE.asEuint32(0);
        euint32 totalHarmonicity = FHE.asEuint32(0);
        euint32 totalTimbreMatch = FHE.asEuint32(0);
        uint32 count = 0;
        
        for (uint256 i = 0; i < inst.length; i++) {
            totalResonance = FHE.add(totalResonance, calculateResonance(inst[i]));
            totalHarmonicity = FHE.add(totalHarmonicity, calculateHarmonicity(inst[i]));
            totalTimbreMatch = FHE.add(totalTimbreMatch, calculateTimbreMatch(inst[i]));
            count++;
        }
        
        acousticAnalyses[msg.sender][analysisId-1] = AcousticAnalysis({
            encryptedResonanceScore: FHE.div(totalResonance, FHE.asEuint32(count)),
            encryptedHarmonicity: FHE.div(totalHarmonicity, FHE.asEuint32(count)),
            encryptedTimbreMatch: FHE.div(totalTimbreMatch, FHE.asEuint32(count)),
            isCompleted: true,
            isRevealed: false
        });
    }

    function performStructuralAnalysis(uint256 analysisId) public onlyResearcher {
        require(analysisId <= analysisCount, "Invalid analysis ID");
        require(!structuralAnalyses[msg.sender][analysisId-1].isCompleted, "Already analyzed");
        
        EncryptedInstrument[] storage inst = instruments[msg.sender];
        euint32 totalIntegrity = FHE.asEuint32(0);
        euint32 totalConsistency = FHE.asEuint32(0);
        uint32 count = 0;
        
        for (uint256 i = 0; i < inst.length; i++) {
            totalIntegrity = FHE.add(totalIntegrity, calculateIntegrity(inst[i]));
            totalConsistency = FHE.add(totalConsistency, calculateConsistency(inst[i]));
            count++;
        }
        
        structuralAnalyses[msg.sender][analysisId-1] = StructuralAnalysis({
            encryptedIntegrityScore: FHE.div(totalIntegrity, FHE.asEuint32(count)),
            encryptedMaterialConsistency: FHE.div(totalConsistency, FHE.asEuint32(count)),
            isCompleted: true,
            isRevealed: false
        });
        
        emit AnalysisCompleted(msg.sender, analysisId);
    }

    function calculateResonance(EncryptedInstrument storage inst) private view returns (euint32) {
        return FHE.div(
            FHE.mul(inst.encryptedMaterial, inst.encryptedDimensions),
            FHE.asEuint32(1000)
        );
    }

    function calculateHarmonicity(EncryptedInstrument storage inst) private view returns (euint32) {
        return FHE.div(
            FHE.mul(inst.encryptedAcousticProfile, FHE.asEuint32(10)),
            FHE.asEuint32(100)
        );
    }

    function calculateTimbreMatch(EncryptedInstrument storage inst) private view returns (euint32) {
        return FHE.div(
            FHE.add(inst.encryptedMaterial, inst.encryptedAcousticProfile),
            FHE.asEuint32(2)
        );
    }

    function calculateIntegrity(EncryptedInstrument storage inst) private view returns (euint32) {
        return FHE.div(
            FHE.add(inst.encryptedMaterial, inst.encryptedDimensions),
            FHE.asEuint32(2)
        );
    }

    function calculateConsistency(EncryptedInstrument storage inst) private view returns (euint32) {
        return FHE.div(
            FHE.mul(inst.encryptedMaterial, inst.encryptedAge),
            FHE.asEuint32(1000)
        );
    }

    function requestResultDecryption(uint256 analysisId) public onlyResearcher {
        require(analysisId <= analysisCount, "Invalid analysis ID");
        require(acousticAnalyses[msg.sender][analysisId-1].isCompleted, "Analysis not complete");
        require(structuralAnalyses[msg.sender][analysisId-1].isCompleted, "Analysis not complete");
        require(!acousticAnalyses[msg.sender][analysisId-1].isRevealed, "Already revealed");
        require(!structuralAnalyses[msg.sender][analysisId-1].isRevealed, "Already revealed");
        
        AcousticAnalysis storage acoustic = acousticAnalyses[msg.sender][analysisId-1];
        StructuralAnalysis storage structural = structuralAnalyses[msg.sender][analysisId-1];
        
        bytes32[] memory ciphertexts = new bytes32[](5);
        ciphertexts[0] = FHE.toBytes32(acoustic.encryptedResonanceScore);
        ciphertexts[1] = FHE.toBytes32(acoustic.encryptedHarmonicity);
        ciphertexts[2] = FHE.toBytes32(acoustic.encryptedTimbreMatch);
        ciphertexts[3] = FHE.toBytes32(structural.encryptedIntegrityScore);
        ciphertexts[4] = FHE.toBytes32(structural.encryptedMaterialConsistency);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysis.selector);
    }

    function decryptAnalysis(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyResearcher {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        address researcher = msg.sender;
        uint256 resultId = decryptedResults[researcher].length;
        
        decryptedResults[researcher].push(DecryptedResult({
            resonanceScore: results[0],
            harmonicity: results[1],
            timbreMatch: results[2],
            integrityScore: results[3],
            materialConsistency: results[4],
            isRevealed: true
        }));
        
        acousticAnalyses[researcher][resultId].isRevealed = true;
        structuralAnalyses[researcher][resultId].isRevealed = true;
        emit ResultRevealed(researcher, resultId+1);
    }

    function getInstrumentCount(address researcher) public view returns (uint256) {
        return instruments[researcher].length;
    }

    function getAnalysisCount(address researcher) public view returns (uint256) {
        return acousticAnalyses[researcher].length;
    }

    function getDecryptedResult(address researcher, uint256 resultId) public view returns (
        uint32 resonanceScore,
        uint32 harmonicity,
        uint32 timbreMatch,
        uint32 integrityScore,
        uint32 materialConsistency,
        bool isRevealed
    ) {
        require(resultId <= decryptedResults[researcher].length, "Invalid result ID");
        DecryptedResult storage result = decryptedResults[researcher][resultId-1];
        return (
            result.resonanceScore,
            result.harmonicity,
            result.timbreMatch,
            result.integrityScore,
            result.materialConsistency,
            result.isRevealed
        );
    }
}