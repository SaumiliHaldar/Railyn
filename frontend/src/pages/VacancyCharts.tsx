import { Calendar, Search, ArrowLeft, Info, AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { formatDate } from "../utils/dateUtils";
import { useToast } from "../components/ui/toast-1";

const API_URL = import.meta.env.VITE_API_URL;

interface ChartResult {
  train_number: string;
  train: string;
  coaches: Array<{
    coach: string;
    class_name: string;
    available: number;
    seats: Array<{
      num: number;
      type: string;
      is_occupied: boolean;
    }>;
  }>;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const localMaxDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 60); // 2 months (60 days) limit
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sanitizeInput = (val: string) => {
  return val.replace(/[<>'"&/]/g, "").trim();
};

const VacancyCharts = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [trainInput, setTrainInput] = useState("");
  const [dateInput, setDateInput] = useState(localToday());
  const [loading, setLoading] = useState(false);
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Sync URL search params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trainParam = sanitizeInput(params.get("train") || "");
    const dateParam = sanitizeInput(params.get("date") || "");

    if (trainParam) {
      setTrainInput(trainParam);
      
      let targetDate = localToday();
      if (dateParam) {
        if (dateParam < localToday()) {
          showToast("Travel date cannot be in the past.", "error");
        } else if (dateParam > localMaxDate()) {
          showToast("Vacancy charts are only available up to 2 months (60 days) in advance.", "error");
        } else {
          targetDate = dateParam;
        }
      }
      setDateInput(targetDate);

      // Alphanumeric safety check for train input (length 2 to 20)
      if (!/^[A-Z0-9\s-]{2,20}$/i.test(trainParam)) {
        setErrorMsg("Invalid train format. Train number/name must contain only letters, numbers, spaces, or hyphens.");
        setChartResult(null);
        return;
      }

      setErrorMsg("");
      fetchChartData(trainParam, targetDate);
    } else {
      setChartResult(null);
      setSelectedCoach(null);
      setErrorMsg("");
    }
  }, [location.search]);

  const fetchChartData = async (train: string, date: string) => {
    setLoading(true);
    setChartResult(null);
    setSelectedCoach(null);
    try {
      const res = await fetch(`${API_URL}/train_chart/${encodeURIComponent(train)}?date=${date}`);
      const data = await res.json();
      if (res.ok) {
        setChartResult(data);
        if (data.coaches && data.coaches.length > 0) {
          setSelectedCoach(data.coaches[0]);
        }
        showToast("Vacancy Chart Loaded", "success");
      } else {
        setErrorMsg(data.detail || "Train chart record not found for the requested date.");
        showToast(data.detail || "Train not found", "error");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect to the server. Please check your network connection.");
      showToast("Error checking vacancy charts", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrain = trainInput.trim();
    if (!cleanTrain) return;

    if (!/^[A-Z0-9\s-]{2,20}$/i.test(cleanTrain)) {
      showToast("Please enter a valid train number or name.", "error");
      setErrorMsg("Train input contains invalid symbols.");
      return;
    }

    if (dateInput < localToday()) {
      showToast("Travel date cannot be in the past.", "error");
      return;
    }

    if (dateInput > localMaxDate()) {
      showToast("Vacancy charts are only available up to 2 months (60 days) in advance.", "error");
      return;
    }

    setErrorMsg("");
    navigate(`/charts?train=${encodeURIComponent(cleanTrain)}&date=${dateInput}`);
  };

  return (
    <div style={{ minHeight: "85vh", background: "#f8fafc", padding: "48px 24px" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        
        {/* Back Link */}
        <button 
          onClick={() => navigate("/")} 
          style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "none", color: "#64748b", fontSize: "14px", fontWeight: 700, cursor: "pointer", marginBottom: "24px" }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>
        
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 900, color: "#1e293b", letterSpacing: "-0.5px" }}>Train Vacancy Charts</h1>
          <p style={{ color: "#64748b", fontSize: "15px", marginTop: "8px" }}>View layout and check occupied/vacant seats room-by-room before booking.</p>
        </div>

        {/* Search Panel */}
        <div style={{ background: "white", padding: "24px", borderRadius: "20px", border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.03)", marginBottom: "32px" }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr)) 160px", gap: "16px", alignItems: "flex-end" }} className="chart-search-form">
            <div className="input-group" style={{ margin: 0 }}>
              <label htmlFor="chart-train-input" style={{ fontSize: "12px", fontWeight: 800 }}>Train Number / Name</label>
              <input 
                id="chart-train-input"
                type="text" 
                placeholder="e.g. 12222 or Duronto" 
                value={trainInput}
                onChange={(e) => setTrainInput(e.target.value)}
                style={{ height: "46px", marginTop: "8px", paddingLeft: "18px" }}
              />
            </div>
            
            <div className="input-group" style={{ margin: 0 }}>
              <label htmlFor="chart-date-input" style={{ fontSize: "12px", fontWeight: 800 }}>Journey Date</label>
              <div style={{ position: "relative", marginTop: "8px" }}>
                <Calendar size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                <input 
                  id="chart-date-input"
                  type="date" 
                  value={dateInput}
                  min={localToday()}
                  max={localMaxDate()}
                  onChange={(e) => setDateInput(e.target.value)}
                  style={{ height: "46px", paddingLeft: "36px" }}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ height: "46px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }} disabled={loading}>
              <Search size={16} /> {loading ? "Searching..." : "Get Chart"}
            </button>
          </form>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ background: "white", padding: "28px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
            <div className="shimmer-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
              <div className="shimmer-box" style={{ width: "240px", height: "24px" }} />
              <div className="shimmer-box" style={{ width: "80px", height: "18px" }} />
            </div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer-box" style={{ width: "60px", height: "40px", borderRadius: "8px" }} />)}
            </div>
            <div className="shimmer-box" style={{ width: "100%", height: "240px", borderRadius: "12px" }} />
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
              <h4 style={{ fontWeight: 800, fontSize: "15px", marginBottom: "4px" }}>Chart Retrieval Failed</h4>
              <p style={{ fontSize: "14px", opacity: 0.85, lineHeight: "1.5" }}>{errorMsg}</p>
            </div>
          </motion.div>
        )}

        {/* Results layout */}
        {!loading && chartResult && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header info */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#1e293b" }}>
                {chartResult.train_number} - {chartResult.train} | <span style={{ color: "#64748b", fontWeight: 600 }}>{formatDate(dateInput)}</span>
              </h2>
              <div style={{ fontSize: "15px", color: "var(--primary)", fontWeight: 700, background: "#f0fdf4", padding: "6px 12px", borderRadius: "20px" }}>
                {chartResult.coaches.reduce((acc, curr) => acc + curr.available, 0)} Total Vacant Seats
              </div>
            </div>

            {/* Coach selection chips row */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "28px" }}>
              {chartResult.coaches.map((c) => {
                const isSelected = selectedCoach?.coach === c.coach;
                return (
                  <button
                    key={c.coach}
                    type="button"
                    className="coach-chip"
                    style={{
                      border: "2px solid",
                      borderColor: isSelected ? "var(--primary)" : "#e2e8f0",
                      background: isSelected ? "#f0fdf4" : "white",
                      color: isSelected ? "#166534" : "#64748b",
                      padding: "8px 16px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 700,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      minWidth: "64px"
                    }}
                    onClick={() => setSelectedCoach(c)}
                  >
                    <span style={{ fontSize: "14px" }}>{c.coach}</span>
                    <span style={{ fontSize: "11px", opacity: 0.8 }}>AVL {c.available}</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive Coach Seat Map */}
            {selectedCoach && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: "white", padding: "28px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                
                {/* Premium Coach Legend */}
                <div className="seat-map-legend" style={{ marginBottom: "24px" }}>
                  <div className="legend-item">
                    <span className="legend-dot available"></span>
                    <span className="legend-text">Available</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot occupied"></span>
                    <span className="legend-text">Booked</span>
                  </div>
                </div>

                {/* Seat Grid in metallic train coach wrapper */}
                <div className="seat-map-wrapper">
                  <div className="seat-grid">
                    {Array.from({ 
                      length: Math.ceil(selectedCoach.seats.length / (selectedCoach.class_name === "2AC" ? 6 : 8))
                    }).map((_, bayIdx) => {
                      const isAC2 = selectedCoach.class_name === "2AC";
                      const baySize = isAC2 ? 6 : 8;
                      const mainSize = isAC2 ? 4 : 6;
                      const baySeats = selectedCoach.seats.slice(bayIdx * baySize, bayIdx * baySize + baySize);
                      
                      return (
                        <div key={bayIdx} className="bay">
                          <div className="bay-label">
                            Cabin {bayIdx + 1} <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span> Seats {bayIdx * baySize + 1} - {bayIdx * baySize + baySeats.length}
                          </div>
                          
                          <div className={`bay-section ${isAC2 ? 'ac2' : ''}`}>
                            {/* Main Cabin Berth Bay (6 seats or 4 seats for AC2) */}
                            <div className={`main-bay ${isAC2 ? 'ac2' : ''}`}>
                              {baySeats.slice(0, mainSize).map((s: any) => (
                                <div 
                                  key={s.num} 
                                  className={`seat-box ${s.is_occupied ? 'occupied' : 'available'}`}
                                  title={`${s.type} - ${s.is_occupied ? 'Occupied' : 'Vacant'}`}
                                >
                                  <span className="s-num">{s.num}</span>
                                  <span className="s-type">{s.type}</span>
                                </div>
                              ))}
                            </div>

                            {/* Side Berth Bay (2 seats) */}
                            <div className="side-bay">
                              {baySeats.slice(mainSize).map((s: any) => (
                                <div 
                                  key={s.num} 
                                  className={`seat-box ${s.is_occupied ? 'occupied' : 'available'}`}
                                  title={`${s.type} - ${s.is_occupied ? 'Occupied' : 'Vacant'}`}
                                >
                                  <span className="s-num">{s.num}</span>
                                  <span className="s-type">{s.type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: "24px", background: "#f8fafc", padding: "14px 16px", borderRadius: "12px", display: "flex", gap: "10px", alignItems: "center", border: "1px solid #e2e8f0" }}>
                  <Info size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>This chart shows the seat vacancy state at the time of final chart preparation before departure.</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VacancyCharts;
