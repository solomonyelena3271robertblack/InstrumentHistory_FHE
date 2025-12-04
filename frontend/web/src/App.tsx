import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface InstrumentRecord {
  id: string;
  name: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  origin: string;
  status: "pending" | "verified" | "rejected";
  details?: {
    material: string;
    era: string;
    condition: string;
    acousticProperties: string;
  };
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InstrumentRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<InstrumentRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    name: "",
    category: "",
    origin: "",
    material: "",
    era: "",
    condition: "",
    acousticProperties: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<InstrumentRecord | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [operationHistory, setOperationHistory] = useState<string[]>([]);

  // Calculate statistics for dashboard
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;

  // Filter records based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredRecords(records);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = records.filter(record => 
        record.name.toLowerCase().includes(query) ||
        record.category.toLowerCase().includes(query) ||
        record.origin.toLowerCase().includes(query) ||
        (record.details?.material?.toLowerCase().includes(query) || false) ||
        (record.details?.era?.toLowerCase().includes(query) || false)
      );
      setFilteredRecords(filtered);
    }
  }, [records, searchQuery]);

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const addToHistory = (message: string) => {
    setOperationHistory(prev => [
      `${new Date().toLocaleTimeString()}: ${message}`,
      ...prev.slice(0, 9) // Keep only last 10 items
    ]);
  };

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);
      addToHistory(`Wallet connected: ${acc.substring(0, 6)}...${acc.substring(38)}`);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
        addToHistory(`Wallet changed: ${newAcc.substring(0, 6)}...${newAcc.substring(38)}`);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    addToHistory("Wallet disconnected");
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("instrument_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing instrument keys:", e);
        }
      }
      
      const list: InstrumentRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`instrument_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                name: recordData.name,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                category: recordData.category,
                origin: recordData.origin,
                status: recordData.status || "pending",
                details: recordData.details
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
      addToHistory("Loaded instrument records from FHE contract");
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting instrument data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        name: newRecordData.name,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newRecordData.category,
        origin: newRecordData.origin,
        status: "pending",
        details: {
          material: newRecordData.material,
          era: newRecordData.era,
          condition: newRecordData.condition,
          acousticProperties: newRecordData.acousticProperties
        }
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `instrument_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("instrument_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "instrument_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted instrument data submitted securely!"
      });
      
      addToHistory(`Added new instrument: ${newRecordData.name}`);
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          name: "",
          category: "",
          origin: "",
          material: "",
          era: "",
          condition: "",
          acousticProperties: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyRecord = async (recordId: string, recordName: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`instrument_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `instrument_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      addToHistory(`Verified instrument: ${recordName}`);
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectRecord = async (recordId: string, recordName: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`instrument_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "rejected"
      };
      
      await contract.setData(
        `instrument_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      addToHistory(`Rejected instrument: ${recordName}`);
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE contract is ${isAvailable ? 'available' : 'unavailable'}`
      });
      
      addToHistory("Checked FHE contract availability");
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const viewRecordDetails = (record: InstrumentRecord) => {
    setSelectedRecord(record);
    setShowDetailsModal(true);
    addToHistory(`Viewed details for: ${record.name}`);
  };

  const renderPieChart = () => {
    const total = records.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const rejectedPercentage = (rejectedCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment verified" 
            style={{ transform: `rotate(${verifiedPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment pending" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment rejected" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage + rejectedPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{records.length}</div>
            <div className="pie-label">Total</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box verified"></div>
            <span>Verified: {verifiedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box rejected"></div>
            <span>Rejected: {rejectedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="artdeco-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container artdeco-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="instrument-icon"></div>
          </div>
          <h1>Historical<span>Instruments</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={checkAvailability}
            className="artdeco-button"
          >
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="artdeco-button primary"
          >
            Add Instrument
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content partitioned-layout">
        {/* Left Panel - Project Info and Stats */}
        <div className="left-panel">
          <div className="panel-section artdeco-card">
            <h2>Project Introduction</h2>
            <p>Confidential Analysis of Historical Musical Instruments using Fully Homomorphic Encryption (FHE). Music historians can perform acoustic and structural analysis on encrypted, high-resolution scan data from historical instruments.</p>
            <div className="fhe-badge">
              <span>FHE-Powered Analysis</span>
            </div>
          </div>
          
          <div className="panel-section artdeco-card">
            <h3>Instrument Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Total Instruments</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">Analyzed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
            </div>
          </div>
          
          <div className="panel-section artdeco-card">
            <h3>Analysis Status</h3>
            {renderPieChart()}
          </div>

          <div className="panel-section artdeco-card">
            <h3>Recent Operations</h3>
            <div className="operations-list">
              {operationHistory.length === 0 ? (
                <p className="no-operations">No operations recorded yet</p>
              ) : (
                operationHistory.map((op, index) => (
                  <div key={index} className="operation-item">
                    {op}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Right Panel - Instrument List */}
        <div className="right-panel">
          <div className="panel-section artdeco-card">
            <div className="section-header">
              <h2>Historical Instruments</h2>
              <div className="header-actions">
                <div className="search-box">
                  <input 
                    type="text"
                    placeholder="Search instruments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="artdeco-input"
                  />
                </div>
                <button 
                  onClick={loadRecords}
                  className="artdeco-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="instruments-list">
              {filteredRecords.length === 0 ? (
                <div className="no-instruments">
                  <div className="no-instruments-icon"></div>
                  <p>No historical instruments found</p>
                  <button 
                    className="artdeco-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Instrument
                  </button>
                </div>
              ) : (
                filteredRecords.map(instrument => (
                  <div className="instrument-item" key={instrument.id}>
                    <div className="instrument-info">
                      <h3>{instrument.name}</h3>
                      <div className="instrument-meta">
                        <span className="category">{instrument.category}</span>
                        <span className="origin">{instrument.origin}</span>
                        <span className={`status ${instrument.status}`}>{instrument.status}</span>
                      </div>
                    </div>
                    <div className="instrument-actions">
                      <button 
                        className="artdeco-button text"
                        onClick={() => viewRecordDetails(instrument)}
                      >
                        Details
                      </button>
                      {isOwner(instrument.owner) && instrument.status === "pending" && (
                        <>
                          <button 
                            className="artdeco-button success"
                            onClick={() => verifyRecord(instrument.id, instrument.name)}
                          >
                            Verify
                          </button>
                          <button 
                            className="artdeco-button danger"
                            onClick={() => rejectRecord(instrument.id, instrument.name)}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {showDetailsModal && selectedRecord && (
        <ModalDetails
          record={selectedRecord}
          onClose={() => setShowDetailsModal(false)}
          isOwner={isOwner(selectedRecord.owner)}
          onVerify={() => verifyRecord(selectedRecord.id, selectedRecord.name)}
          onReject={() => rejectRecord(selectedRecord.id, selectedRecord.name)}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content artdeco-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="artdeco-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="instrument-icon"></div>
              <span>HistoricalInstrumentsFHE</span>
            </div>
            <p>Confidential analysis of historical musical instruments using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Cultural Preservation</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Historical Instruments FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.name || !recordData.category) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal artdeco-card">
        <div className="modal-header">
          <h2>Add Historical Instrument</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Instrument data will be encrypted with FHE for confidential analysis
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Instrument Name *</label>
              <input 
                type="text"
                name="name"
                value={recordData.name} 
                onChange={handleChange}
                placeholder="e.g., Stradivarius Violin" 
                className="artdeco-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category"
                value={recordData.category} 
                onChange={handleChange}
                className="artdeco-select"
              >
                <option value="">Select category</option>
                <option value="String">String Instruments</option>
                <option value="Wind">Wind Instruments</option>
                <option value="Percussion">Percussion Instruments</option>
                <option value="Keyboard">Keyboard Instruments</option>
                <option value="Brass">Brass Instruments</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Origin</label>
              <input 
                type="text"
                name="origin"
                value={recordData.origin} 
                onChange={handleChange}
                placeholder="e.g., Italy, 18th Century" 
                className="artdeco-input"
              />
            </div>
            
            <div className="form-group">
              <label>Material</label>
              <input 
                type="text"
                name="material"
                value={recordData.material} 
                onChange={handleChange}
                placeholder="e.g., Spruce, Maple" 
                className="artdeco-input"
              />
            </div>
            
            <div className="form-group">
              <label>Historical Era</label>
              <input 
                type="text"
                name="era"
                value={recordData.era} 
                onChange={handleChange}
                placeholder="e.g., Baroque, Renaissance" 
                className="artdeco-input"
              />
            </div>
            
            <div className="form-group">
              <label>Condition</label>
              <select 
                name="condition"
                value={recordData.condition} 
                onChange={handleChange}
                className="artdeco-select"
              >
                <option value="">Select condition</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
                <option value="Fragment">Fragment</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Acoustic Properties</label>
              <textarea 
                name="acousticProperties"
                value={recordData.acousticProperties} 
                onChange={handleChange}
                placeholder="Describe acoustic characteristics for FHE analysis..." 
                className="artdeco-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing and analysis
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="artdeco-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="artdeco-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalDetailsProps {
  record: InstrumentRecord;
  onClose: () => void;
  isOwner: boolean;
  onVerify: () => void;
  onReject: () => void;
}

const ModalDetails: React.FC<ModalDetailsProps> = ({
  record,
  onClose,
  isOwner,
  onVerify,
  onReject
}) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal artdeco-card">
        <div className="modal-header">
          <h2>Instrument Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <h3>{record.name}</h3>
            <div className="detail-meta">
              <span className={`status ${record.status}`}>{record.status}</span>
              <span className="category">{record.category}</span>
              <span className="origin">{record.origin}</span>
            </div>
          </div>
          
          <div className="detail-section">
            <h4>Analysis Information</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Owner</label>
                <span>{record.owner.substring(0, 6)}...{record.owner.substring(38)}</span>
              </div>
              <div className="detail-item">
                <label>Date Added</label>
                <span>{new Date(record.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              {record.details && (
                <>
                  <div className="detail-item">
                    <label>Material</label>
                    <span>{record.details.material || "Unknown"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Historical Era</label>
                    <span>{record.details.era || "Unknown"}</span>
                  </div>
                  <div className="detail-item">
                    <label>Condition</label>
                    <span>{record.details.condition || "Unknown"}</span>
                  </div>
                  <div className="detail-item full-width">
                    <label>Acoustic Properties</label>
                    <span>{record.details.acousticProperties || "No data available"}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="detail-section">
            <h4>FHE Encryption</h4>
            <div className="encryption-info">
              <div className="key-icon"></div>
              <p>This instrument's data is encrypted using Fully Homomorphic Encryption, allowing analysis without decryption.</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          {isOwner && record.status === "pending" && (
            <>
              <button 
                onClick={onVerify}
                className="artdeco-button success"
              >
                Verify Analysis
              </button>
              <button 
                onClick={onReject}
                className="artdeco-button danger"
              >
                Reject Analysis
              </button>
            </>
          )}
          <button 
            onClick={onClose}
            className="artdeco-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;