import { useAuth } from "@clerk/clerk-react";
import { Search, AlertCircle, ArrowLeft, Ticket } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import ETicket from "../components/Ticket";
import { useToast } from "../components/ui/toast-1";

const API_URL = import.meta.env.VITE_API_URL;

interface BookingData {
  _id?: string;
  pnr: string;
  train_number: string;
  train_name: string;
  from_stn: string;
  to_stn: string;
  departure: string;
  arrival: string;
  travel_date: string;
  class_type: string;
  status: string;
  passengers: Array<{
    name: string;
    age: number;
    gender: string;
    coach?: string;
    seat?: number;
    status?: string;
  }>;
}

const sanitizeInput = (val: string) => {
  return val.replace(/[<>'"&/]/g, "").trim();
};

const PnrStatus = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken } = useAuth();
  const { showToast } = useToast();

  const [pnrInput, setPnrInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pnrResult, setPnrResult] = useState<BookingData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Load and validate PNR from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pnrParam = sanitizeInput(params.get("pnr") || "");

    if (pnrParam) {
      setPnrInput(pnrParam);
      
      // Strict 10-digit validation
      if (!/^\d{10}$/.test(pnrParam)) {
        setErrorMsg("Invalid PNR format. PNR must be exactly 10 digits (e.g. 1234567890).");
        setPnrResult(null);
        return;
      }

      setErrorMsg("");
      fetchPnrStatus(pnrParam);
    } else {
      setPnrResult(null);
      setErrorMsg("");
    }
  }, [location.search]);

  const fetchPnrStatus = async (pnrNum: string) => {
    setLoading(true);
    setPnrResult(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/pnr_status/${pnrNum}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setPnrResult(data.booking);
        showToast("PNR Status Found", "success");
      } else {
        setErrorMsg(data.detail || "No booking record found for the provided PNR.");
        showToast(data.detail || "PNR not found", "error");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect to the server. Please check your network connection.");
      showToast("Error checking PNR status", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPnr = pnrInput.replace(/\s+/g, "");
    if (!cleanPnr) return;
    
    // Strict pre-check
    if (!/^\d{10}$/.test(cleanPnr)) {
      showToast("Please enter a valid 10-digit numeric PNR.", "error");
      setErrorMsg("PNR must be exactly 10 numeric digits.");
      return;
    }

    setErrorMsg("");
    navigate(`/pnr?pnr=${cleanPnr}`);
  };

  return (
    <div style={{ minHeight: "85vh", background: "#f8fafc", padding: "48px 24px" }}>
      <div style={{ maxWidth: "520px", margin: "0 auto" }}>
        
        {/* Header Back Link */}
        <button 
          onClick={() => navigate("/")} 
          style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "none", color: "#64748b", fontSize: "14px", fontWeight: 700, cursor: "pointer", marginBottom: "24px" }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 900, color: "#1e293b", letterSpacing: "-0.5px" }}>PNR Status Inquiry</h1>
          <p style={{ color: "#64748b", fontSize: "15px", marginTop: "8px" }}>Get real-time details and verification status of your booking.</p>
        </div>

        {/* Search Card Widget */}
        <div style={{ background: "white", padding: "28px", borderRadius: "20px", border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.03)", marginBottom: "32px" }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label htmlFor="pnr-input-field" style={{ fontSize: "12px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Enter 10-digit PNR</label>
              <div style={{ position: "relative", marginTop: "8px" }}>
                <Ticket size={20} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--primary)" }} />
                <input 
                  id="pnr-input-field"
                  type="text" 
                  placeholder="e.g. 1234567890" 
                  value={pnrInput}
                  onChange={(e) => setPnrInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  style={{ height: "54px", fontSize: "16px", paddingLeft: "48px", width: "100%", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: "100%", height: "50px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
              disabled={loading}
            >
              <Search size={18} /> {loading ? "Verifying..." : "Check PNR Status"}
            </button>
          </form>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="skeleton-train-card" style={{ background: "white", padding: "28px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
            <div className="shimmer-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
              <div className="shimmer-box" style={{ width: "120px", height: "20px" }} />
              <div className="shimmer-box" style={{ width: "60px", height: "20px" }} />
            </div>
            <div className="shimmer-box" style={{ width: "100%", height: "120px", borderRadius: "12px", marginBottom: "20px" }} />
            <div className="shimmer-box" style={{ width: "100%", height: "48px", borderRadius: "10px" }} />
          </div>
        )}

        {/* Error State */}
        {!loading && errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ 
              background: "#fef2f2", 
              border: "1px solid #fee2e2", 
              borderRadius: "16px", 
              padding: "20px", 
              display: "flex", 
              gap: "14px", 
              alignItems: "flex-start",
              color: "#991b1b"
            }}
          >
            <AlertCircle size={22} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <h4 style={{ fontWeight: 800, fontSize: "15px", marginBottom: "4px" }}>Verification Failed</h4>
              <p style={{ fontSize: "14px", opacity: 0.85, lineHeight: "1.5" }}>{errorMsg}</p>
            </div>
          </motion.div>
        )}

        {/* PNR Ticket Output */}
        {!loading && pnrResult && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
          >
            {/* Premium Boarding Ticket Card */}
            <div style={{ overflow: "visible", borderRadius: "20px" }}>
              <ETicket 
                pnr={pnrResult.pnr}
                trainName={pnrResult.train_name}
                trainNumber={pnrResult.train_number}
                departureTime={pnrResult.departure}
                arrivalTime={pnrResult.arrival}
                fromStn={pnrResult.from_stn}
                toStn={pnrResult.to_stn}
                date={pnrResult.travel_date}
                classType={pnrResult.class_type}
                passengers={pnrResult.passengers || []}
                status={pnrResult.status}
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default PnrStatus;
