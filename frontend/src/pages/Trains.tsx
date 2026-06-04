import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import {
  Train, Clock, X, Star, Trash2, AlertCircle, Filter, Check
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import ETicket from "../components/Ticket";
import PaymentModal from "../components/PaymentModal";
import { useToast } from "../components/ui/toast-1";

const API_URL = import.meta.env.VITE_API_URL;

interface TrainData {
  train_number: string;
  train_name: string;
  type: string;
  departure: string;
  arrival: string;
  duration_h: number;
  duration_m: number;
  seat_inventory: Record<string, number>;
  fares: Record<string, number>;
  wl_probabilities?: Record<string, string>;
}

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

interface Passenger {
  name: string;
  age: string;
  gender: string;
  isCustom?: boolean;
}

const getRunsOnDays = (trainNumber: string): boolean[] => {
  const digitsSum = trainNumber.split('').reduce((sum, ch) => sum + (parseInt(ch, 10) || 0), 0);
  const patterns = [
    [true, true, true, true, true, true, true],     // Daily
    [true, true, true, true, true, true, false],    // Except Sunday
    [true, false, true, false, true, false, false], // Mon, Wed, Fri
    [false, true, false, true, false, true, false], // Tue, Thu, Sat
    [false, false, false, false, false, true, true], // Weekend only
    [true, true, true, true, true, false, false],   // Weekdays only
    [true, false, false, true, false, false, true], // Mon, Thu, Sun
  ];
  return patterns[digitsSum % patterns.length];
};

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

const Trains = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const { showToast } = useToast();

  // Search parameters
  const [fromCode, setFromCode] = useState("");
  const [toCode, setToCode] = useState("");
  const [date, setDate] = useState("");
  const [classType, setClassType] = useState("");

  // Input validation state
  const [isValidSearch, setIsValidSearch] = useState(false);
  const [validationError, setValidationError] = useState("");

  // API response states
  const [trains, setTrains] = useState<TrainData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedTrainTypes, setSelectedTrainTypes] = useState<string[]>([]);
  const [selectedDepartTimes, setSelectedDepartTimes] = useState<string[]>([]); // Morning, Afternoon, Evening, Night
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  // Booking states
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([{ name: "", age: "", gender: "Male", isCustom: true }]);
  const [savedPassengers, setSavedPassengers] = useState<any[]>([]);
  const [savingPassengerIndex, setSavingPassengerIndex] = useState<number | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingData | null>(null);

  // Load and validate search queries
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromParam = sanitizeInput(params.get("from") || "");
    const toParam = sanitizeInput(params.get("to") || "");
    const dateParam = sanitizeInput(params.get("date") || "");
    const classParam = sanitizeInput(params.get("class") || "");

    // Safety Checks & Strict Validation
    if (!fromParam || !toParam || !dateParam) {
      setValidationError("Missing required search parameters.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    // Code must be uppercase alphanumeric (2 to 6 characters)
    const codeRegex = /^[A-Z0-9]{2,6}$/i;
    if (!codeRegex.test(fromParam) || !codeRegex.test(toParam)) {
      setValidationError("Invalid station code format detected. Only letters and numbers are permitted.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    // Date must be YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateParam)) {
      setValidationError("Invalid date format detected.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    if (dateParam < localToday()) {
      setValidationError("Travel date cannot be in the past.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    if (dateParam > localMaxDate()) {
      setValidationError("Booking is only allowed up to 2 months (60 days) in advance.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    setValidationError("");
    setIsValidSearch(true);
    setFromCode(fromParam.toUpperCase());
    setToCode(toParam.toUpperCase());
    setDate(dateParam);
    setClassType(classParam);

    // Perform API fetch
    fetchTrains(fromParam, toParam);
  }, [location.search]);

  // Fetch Trains
  const fetchTrains = async (fCode: string, tCode: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/trn_search?from_stn=${fCode}&to_stn=${tCode}`);
      const data = await res.json();
      if (res.ok) {
        setTrains(data.results || []);
      } else {
        showToast(data.detail || "Error loading trains", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Could not contact servers. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };



  // Fetch Saved Passengers when passenger modal opens
  const fetchSavedPassengers = async (skipReset = false) => {
    if (!user) {
      if (!skipReset) setPassengers([{ name: "", age: "", gender: "Male", isCustom: true }]);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/saved_passengers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const list = data.passengers || [];
      setSavedPassengers(list);
      if (!skipReset) {
        if (list.length === 0) {
          setPassengers([{ name: "", age: "", gender: "Male", isCustom: true }]);
        } else {
          setPassengers([]);
        }
      }
    } catch (err) {
      console.error("Error fetching saved passengers:", err);
      if (!skipReset) setPassengers([{ name: "", age: "", gender: "Male", isCustom: true }]);
    }
  };

  useEffect(() => {
    if (selectedTrain && user) {
      fetchSavedPassengers();
    }
  }, [selectedTrain, user]);

  useEffect(() => {
    if (!selectedTrain) {
      setPassengers([{ name: "", age: "", gender: "Male", isCustom: true }]);
    }
  }, [selectedTrain]);

  const toggleSavedPassenger = (sp: any) => {
    const isAlreadyAdded = passengers.some(p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase() && !p.isCustom);
    if (isAlreadyAdded) {
      setPassengers(prev => prev.filter(p => p.name.trim().toLowerCase() !== sp.name.trim().toLowerCase() || p.isCustom));
    } else {
      setPassengers(prev => [...prev, { name: sp.name, age: String(sp.age), gender: sp.gender, isCustom: false }]);
    }
  };

  const toggleSaveToProfile = async (passenger: Passenger, index: number) => {
    if (!user) return showToast("Please login to save passengers", "warning");
    const pName = sanitizeInput(passenger.name);
    const pAge = parseInt(passenger.age);
    if (!pName || isNaN(pAge)) {
      return showToast("Valid name and age required to save", "error");
    }

    setSavingPassengerIndex(index);
    const isSaved = savedPassengers.some(sp => sp.name.trim().toLowerCase() === pName.toLowerCase());
    const token = await getToken();

    try {
      if (isSaved) {
        const res = await fetch(`${API_URL}/saved_passengers/${encodeURIComponent(pName)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          showToast(`Removed ${pName} from saved list`, "success");
          await fetchSavedPassengers(true);
        } else {
          showToast("Failed to remove passenger", "error");
        }
      } else {
        const res = await fetch(`${API_URL}/saved_passengers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: pName,
            age: pAge,
            gender: passenger.gender
          })
        });
        if (res.ok) {
          showToast(`Saved ${pName} to profile`, "success");
          await fetchSavedPassengers(true);
        } else {
          showToast("Failed to save passenger", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating saved passenger status", "error");
    } finally {
      setSavingPassengerIndex(null);
    }
  };

  const handleBook = () => {
    if (!user) {
      showToast("Please login to book tickets", "warning");
      openSignIn();
      return;
    }
    if (passengers.length === 0) {
      showToast("Please add at least one passenger details", "error");
      return;
    }
    if (passengers.some(p => !sanitizeInput(p.name) || !p.age || isNaN(parseInt(p.age)))) {
      showToast("Please enter valid name and age for all passengers", "error");
      return;
    }
    setShowPayment(true);
  };

  const handleBookingSuccess = (data: any) => {
    setBookingSuccess(data.booking);
    setShowPayment(false);
    showToast("Booking Confirmed! Redirecting to dashboard...", "success");

    // Local UI seat update
    if (data.booking?.status === "CNF" && selectedTrain && selectedClass) {
      const numPax = passengers.length;
      setTrains(prevTrains => prevTrains.map(t => {
        if (t.train_number === selectedTrain.train_number) {
          const currentCount = t.seat_inventory[selectedClass] || 0;
          return {
            ...t,
            seat_inventory: {
              ...t.seat_inventory,
              [selectedClass]: Math.max(0, currentCount - numPax)
            }
          };
        }
        return t;
      }));
    }

    setTimeout(() => {
      navigate("/dashboard");
    }, 4500);
  };

  // Helper: Check if database train type maps to selected UI filter type
  const checkTrainTypeMatch = (trainType: string, filterType: string): boolean => {
    const t = trainType.toLowerCase();
    const f = filterType.toLowerCase();
    if (f === "vande") {
      return t === "shtb" || t === "jshtb" || t === "raj";
    }
    if (f === "duronto") {
      return t === "drnt";
    }
    if (f === "superfast") {
      return t === "sf" || t === "skr";
    }
    if (f === "express") {
      return t === "exp" || t === "mail" || t === "gr";
    }
    if (f === "passenger") {
      return t === "pass" || t === "demu" || t === "memu" || t === "toy" || t === "klkt" || t === "del" || t === "hyd" || t === "";
    }
    return false;
  };

  // Helper: Filter checks
  const filteredTrains = trains.filter(t => {
    // Class filter (inline search check)
    if (classType && t.seat_inventory[classType] === undefined) return false;

    // Train Type filter
    if (selectedTrainTypes.length > 0) {
      const match = selectedTrainTypes.some(type => checkTrainTypeMatch(t.type, type));
      if (!match) return false;
    }

    // Departure Time filter
    if (selectedDepartTimes.length > 0) {
      const depHour = parseInt(t.departure.split(":")[0]);
      let timeGroup = "";
      if (depHour >= 0 && depHour < 6) timeGroup = "Night";
      else if (depHour >= 6 && depHour < 12) timeGroup = "Morning";
      else if (depHour >= 12 && depHour < 18) timeGroup = "Afternoon";
      else timeGroup = "Evening";

      if (!selectedDepartTimes.includes(timeGroup)) return false;
    }

    // Available Only filter
    if (showAvailableOnly) {
      const hasAvailability = Object.values(t.seat_inventory).some(count => count > 0);
      if (!hasAvailability) return false;
    }

    return true;
  });

  const toggleTrainTypeFilter = (type: string) => {
    setSelectedTrainTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleDepartTimeFilter = (time: string) => {
    setSelectedDepartTimes(prev => prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time]);
  };

  if (!isValidSearch) {
    return (
      <div className="flex-center-container" style={{ padding: '80px 24px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Security Validation Error</h2>
        <p style={{ color: '#64748b', maxWidth: '480px', marginBottom: '24px' }}>{validationError || "Invalid URL request inputs detected."}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Go back to Homepage</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "90vh", background: "#f8fafc", paddingTop: "100px", paddingBottom: "60px" }}>

      {/* Main Responsive Grid Layout */}
      <div style={{ maxWidth: "1200px", margin: "32px auto", padding: "0 24px" }} className="trains-layout-grid">
        
        {/* Left Filters Panel */}
        <aside className="filters-aside" style={{ background: "white", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0", height: "fit-content" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={18} /> Filters
            </h3>
            <button style={{ border: "none", background: "none", color: "var(--primary)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }} onClick={() => { setSelectedTrainTypes([]); setSelectedDepartTimes([]); setShowAvailableOnly(false); }}>
              Reset All
            </button>
          </div>

          {/* Available Only Toggle */}
          <div style={{ marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
              <input type="checkbox" checked={showAvailableOnly} onChange={(e) => setShowAvailableOnly(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }} />
              Show Available Trains Only
            </label>
          </div>

          {/* Train Types */}
          <div style={{ marginBottom: "24px", paddingBottom: "16px", borderBottom: "1px solid #f1f5f9" }}>
            <h4 style={{ fontSize: "13px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: "12px" }}>Train Types</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {["Vande", "Duronto", "Superfast", "Express", "Passenger"].map(type => (
                <label key={type} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedTrainTypes.includes(type)} onChange={() => toggleTrainTypeFilter(type)} style={{ accentColor: "var(--primary)" }} />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {/* Departure Times */}
          <div>
            <h4 style={{ fontSize: "13px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: "12px" }}>Departure Times</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { name: "Morning", label: "Morning (06:00 - 12:00)" },
                { name: "Afternoon", label: "Afternoon (12:00 - 18:00)" },
                { name: "Evening", label: "Evening (18:00 - 24:00)" },
                { name: "Night", label: "Night (00:00 - 06:00)" }
              ].map(t => (
                <label key={t.name} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedDepartTimes.includes(t.name)} onChange={() => toggleDepartTimeFilter(t.name)} style={{ accentColor: "var(--primary)" }} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Train List Results */}
        <section>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-train-card" style={{ background: "white", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                  <div className="shimmer-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                    <div className="shimmer-box shimmer-line-lg" style={{ width: "200px", height: "20px" }} />
                    <div className="shimmer-box shimmer-line-sm" style={{ width: "100px", height: "14px" }} />
                  </div>
                  <div className="shimmer-row" style={{ display: "flex", justifyContent: "center", gap: "32px", marginBottom: "16px" }}>
                    <div className="shimmer-box" style={{ width: "60px", height: "24px" }} />
                    <div className="shimmer-box" style={{ flex: 1, height: "8px", borderRadius: "4px" }} />
                    <div className="shimmer-box" style={{ width: "60px", height: "24px" }} />
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[1, 2, 3].map(j => (
                      <div key={j} className="shimmer-box" style={{ flex: 1, height: "80px", borderRadius: "12px" }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTrains.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", textAlign: "center" }}>
              <Train size={48} color="#94a3b8" style={{ marginBottom: "16px" }} />
              <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", marginBottom: "8px" }}>No Trains Available</h3>
              <p style={{ color: "#64748b", maxWidth: "380px" }}>No trains match the requested route filters. Modify your search criteria or try another date.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {filteredTrains.map((train, idx) => (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} key={train.train_number} className="train-card" style={{ background: "white", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
                  
                  {/* Card Header */}
                  <div className="train-main-info" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                    <div className="train-name-box">
                      <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b" }}>{train.train_name}</h3>
                      <span className="train-id" style={{ fontSize: "12px", color: "#64748b" }}>#{train.train_number} | {train.type}</span>
                    </div>
                    <div className="route-timeline" style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                      <div className="stn-info" style={{ textAlign: "right" }}>
                        <span className="time" style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", display: "block" }}>{train.departure}</span>
                        <span className="stn-code" style={{ fontSize: "12px", color: "#64748b" }}>{fromCode}</span>
                      </div>
                      <div className="duration-line" style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "100px" }}>
                        <span className="duration-pill" style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", background: "#f1f5f9", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={10} />{train.duration_h}h {train.duration_m}m
                        </span>
                        <div style={{ height: "2px", background: "#e2e8f0", width: "100%", margin: "8px 0" }}></div>
                      </div>
                      <div className="stn-info">
                        <span className="time" style={{ fontSize: "16px", fontWeight: 800, color: "#1e293b", display: "block" }}>{train.arrival}</span>
                        <span className="stn-code" style={{ fontSize: "12px", color: "#64748b" }}>{toCode}</span>
                      </div>
                    </div>
                  </div>

                  {/* Seat Class Select Buttons */}
                  <div className="seat-inventory">
                    {Object.entries(train.seat_inventory as Record<string, number>)
                      .filter(([cls]) => !classType || cls === classType)
                      .map(([cls, count]) => {
                        const fare = train.fares?.[cls] || 0;
                        const isSelect = selectedTrain?.train_number === train.train_number && selectedClass === cls;
                        return (
                          <div key={cls} className={`seat-box ${count > 0 ? "available" : "wl"} ${isSelect ? "selected" : ""}`} style={{ padding: "16px", borderRadius: "12px", border: "2px solid", borderColor: isSelect ? "var(--primary)" : "#e2e8f0", cursor: "pointer", background: isSelect ? "#f0fdf4" : "transparent" }} onClick={() => { setSelectedTrain(train); setSelectedClass(cls); }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <span style={{ fontSize: "14px", fontWeight: 800, color: "#1e293b" }}>{cls}</span>
                              <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--primary)" }}>₹{fare}</span>
                            </div>
                            <span style={{ fontSize: "15px", fontWeight: 800, display: "block", color: count > 0 ? "#166534" : "#991b1b" }}>
                              {count > 0 ? `AVL ${count}` : `WL ${Math.abs(count)}`}
                            </span>
                            <button className="book-mini-btn" style={{ marginTop: "12px", width: "100%", padding: "6px", background: "var(--primary)", border: "none", borderRadius: "8px", color: "white", fontSize: "12px", fontWeight: 700 }}>
                              Book Now
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {/* Confirmation Probabilities Legend */}
                  <div className="train-meta-footer" style={{ borderTop: "1px solid #f1f5f9", paddingTop: "16px", marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Confirmation Chance:</span>
                      {Object.entries(train.wl_probabilities || {})
                        .filter(([cls]) => !classType || cls === classType)
                        .map(([cls, prob]) => (
                          <span key={cls} className={`prob-badge ${prob.toLowerCase()}`} style={{ 
                            fontSize: "11px", 
                            fontWeight: "700", 
                            padding: "4px 10px", 
                            borderRadius: "20px",
                            background: prob.toLowerCase() === "high" ? "#f0fdf4" : prob.toLowerCase() === "medium" ? "#fffbeb" : "#fef2f2",
                            color: prob.toLowerCase() === "high" ? "#166534" : prob.toLowerCase() === "medium" ? "#92400e" : "#991b1b",
                            border: "1px solid currentColor"
                          }}>
                            {cls}: {prob}
                          </span>
                        ))}
                    </div>

                    {/* Weekly Schedule Days */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", color: "#94a3b8" }}>
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Runs On:</span>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {["M", "T", "W", "T", "F", "S", "S"].map((day, dIdx) => {
                          const runs = getRunsOnDays(train.train_number)[dIdx];
                          return (
                            <span key={dIdx} style={{ 
                              color: runs ? "#1e293b" : "#cbd5e1", 
                              background: runs ? "#f1f5f9" : "transparent",
                              borderRadius: "4px",
                              width: "18px",
                              height: "18px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "10px"
                            }}>
                              {day}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Booking Overlay Card Modal */}
      <AnimatePresence>
        {selectedTrain && selectedClass && (
          <div className="modal-overlay" onClick={() => {
            if (bookingSuccess) {
              setSelectedTrain(null);
              setSelectedClass(null);
              setBookingSuccess(null);
            }
          }}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} onClick={e => e.stopPropagation()} className="booking-modal" style={{ background: bookingSuccess ? "transparent" : "white", padding: 0, maxWidth: bookingSuccess ? "520px" : "600px", boxShadow: bookingSuccess ? "none" : "0 20px 40px rgba(0,0,0,0.1)", overflow: bookingSuccess ? "visible" : "hidden" }}>
              {bookingSuccess ? (
                <>
                  <div className="ticket-wrapper">
                    <ETicket 
                      pnr={bookingSuccess.pnr}
                      trainName={selectedTrain.train_name}
                      trainNumber={selectedTrain.train_number}
                      departureTime={selectedTrain.departure}
                      arrivalTime={selectedTrain.arrival}
                      fromStn={fromCode}
                      toStn={toCode}
                      date={date}
                      classType={selectedClass}
                      passengers={bookingSuccess.passengers}
                      status={bookingSuccess.status}
                    />
                  </div>
                  <div style={{ padding: "12px 24px 24px" }}>
                    <button className="btn btn-primary" style={{ width: "100%", height: "48px" }} onClick={() => { setSelectedTrain(null); setSelectedClass(null); setBookingSuccess(null); setShowPayment(false); }}>
                      Back to Trains List
                    </button>
                  </div>
                </>
              ) : showPayment ? (
                <PaymentModal 
                  user={user}
                  selectedTrain={selectedTrain}
                  selectedClass={selectedClass}
                  passengers={passengers}
                  fromStn={`${fromCode} - STATION`}
                  toStn={`${toCode} - STATION`}
                  travelDate={date}
                  getToken={getToken}
                  onSuccess={handleBookingSuccess}
                  onCancel={() => setShowPayment(false)}
                  apiUrl={API_URL}
                  razorpayKeyId={import.meta.env.VITE_RAZORPAY_KEY_ID}
                />
              ) : (
                <>
                  <div className="modal-header" style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h2 style={{ fontSize: "20px", fontWeight: 800 }}>Passenger Details</h2>
                      <p style={{ fontSize: "12px", color: "#64748b" }}>{selectedTrain.train_name} (#{selectedTrain.train_number}) | Class: {selectedClass}</p>
                    </div>
                    <button className="close-btn" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => { setSelectedTrain(null); setSelectedClass(null); }}><X /></button>
                  </div>

                  <div className="modal-body" style={{ maxHeight: "55vh", overflowY: "auto", padding: "20px 24px" }}>
                    {/* Guest Warnings */}
                    {!user && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <AlertCircle size={20} color="#b45309" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: "13px", color: "#92400e", fontWeight: 600 }}>You are booking as a guest. Please sign in to save details to your profile.</span>
                      </div>
                    )}

                    {/* Saved Profiles */}
                    {user && savedPassengers.length > 0 && (
                      <div style={{ marginBottom: "24px" }}>
                        <label style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", display: "block", marginBottom: "12px", letterSpacing: "0.5px" }}>Select Saved Passengers</label>
                        <div className="passenger-select-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                          {savedPassengers.map(sp => {
                            const isSelect = passengers.some(p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase() && !p.isCustom);
                            return (
                              <div key={sp.name} className={`passenger-select-card ${isSelect ? "active" : ""}`} style={{ padding: "12px", borderRadius: "10px", border: "1px solid", borderColor: isSelect ? "var(--primary)" : "#e2e8f0", background: isSelect ? "#f0fdf4" : "transparent", cursor: "pointer", display: "flex", gap: "8px", alignItems: "center" }} onClick={() => toggleSavedPassenger(sp)}>
                                <div className={`custom-checkbox ${isSelect ? "checked" : ""}`} style={{ width: "16px", height: "16px", border: "1px solid #cbd5e1", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {isSelect && <Check size={12} color="var(--primary)" />}
                                </div>
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>{sp.name}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>{sp.age} • {sp.gender}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom forms */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {user && savedPassengers.length > 0 && (
                        <label style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", display: "block" }}>Add New Passenger</label>
                      )}

                      {passengers.map((p, i) => {
                        const isCustom = !user || savedPassengers.length === 0 || p.isCustom;
                        if (!isCustom) return null;

                        const isSaved = savedPassengers.some(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                        return (
                          <div key={i} style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px auto", gap: "12px", alignItems: "flex-end" }}>
                              <div className="input-group">
                                <label style={{ fontSize: "11px" }}>Name</label>
                                <input type="text" value={p.name} onChange={(e) => { const newP = [...passengers]; newP[i].name = e.target.value; setPassengers(newP); }} style={{ height: "38px" }} />
                              </div>
                              <div className="input-group">
                                <label style={{ fontSize: "11px" }}>Age</label>
                                <input type="number" value={p.age} onChange={(e) => { const newP = [...passengers]; newP[i].age = e.target.value; setPassengers(newP); }} style={{ height: "38px" }} />
                              </div>
                              <div className="input-group">
                                <label style={{ fontSize: "11px" }}>Gender</label>
                                <select value={p.gender} onChange={(e) => { const newP = [...passengers]; newP[i].gender = e.target.value; setPassengers(newP); }} style={{ height: "38px", width: "100%", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                                  <option>Male</option>
                                  <option>Female</option>
                                  <option>Other</option>
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: "8px" }}>
                                {user && p.name.trim() && (
                                  <button type="button" onClick={() => toggleSaveToProfile(p, i)} disabled={savingPassengerIndex === i} style={{ border: "none", background: "none", cursor: "pointer", color: isSaved ? "#eab308" : "#94a3b8" }}>
                                    <Star size={18} fill={isSaved ? "#eab308" : "none"} />
                                  </button>
                                )}
                                <button type="button" onClick={() => setPassengers(prev => prev.filter((_, idx) => idx !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444" }}>
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button className="add-btn" style={{ marginTop: "12px", border: "1px dashed #cbd5e1", width: "100%", padding: "10px", borderRadius: "10px", cursor: "pointer", color: "#64748b", background: "none", fontSize: "13px" }} onClick={() => setPassengers([...passengers, { name: "", age: "", gender: "Male", isCustom: true }])}>
                      + Add New Passenger
                    </button>
                  </div>

                  <div className="modal-footer" style={{ borderTop: "1px solid #f1f5f9", padding: "20px 24px", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--primary)" }}>
                      Total: ₹{(selectedTrain.fares?.[selectedClass] || 0) * passengers.length}
                    </div>
                    <button className="btn btn-primary" onClick={handleBook}>
                      {user ? "Proceed to Payment" : "Login to Book"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Trains;
