import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import {
  Train, X, Star, Trash2, AlertCircle, Filter, Check, ArrowRight, Calendar, UserPlus, ShieldCheck, Edit2, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  d.setDate(d.getDate() + 60);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const sanitizeInput = (val: string) => val.replace(/[<>'"&/]/g, "").trim();

const formatDuration = (h: number, m: number) => {
  return `${h}h ${m}m`;
};

const Trains = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const { showToast } = useToast();

  const [fromCode, setFromCode] = useState("");
  const [toCode, setToCode] = useState("");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [date, setDate] = useState("");
  const [classType, setClassType] = useState("");

  const [isValidSearch, setIsValidSearch] = useState(false);
  const [validationError, setValidationError] = useState("");

  const [trains, setTrains] = useState<TrainData[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeHasTrains, setRouteHasTrains] = useState<boolean | null>(null); // null = not yet determined

  // Preserve passenger form data across login flow (Issue 5)
  const pendingPassengersRef = useRef<typeof passengers | null>(null);

  // Filters state
  const [selectedTrainTypes, setSelectedTrainTypes] = useState<string[]>([]);
  const [selectedDepartTimes, setSelectedDepartTimes] = useState<string[]>([]);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [showACOnly, setShowACOnly] = useState(false);
  const [isFreeCancellation, setIsFreeCancellation] = useState(false);

  // Booking states
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([{ name: "", age: "", gender: "Male", isCustom: true }]);
  const [savedPassengers, setSavedPassengers] = useState<any[]>([]);
  const [savingPassengerIndex, setSavingPassengerIndex] = useState<number | null>(null);
  const [editingSavedPassenger, setEditingSavedPassenger] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", age: "", gender: "Male" });
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingData | null>(null);

  // Custom Date Picker State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const generateCalendarGrid = () => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromParam = sanitizeInput(params.get("from") || "");
    const toParam = sanitizeInput(params.get("to") || "");
    const fromNameParam = sanitizeInput(params.get("fromName") || fromParam);
    const toNameParam = sanitizeInput(params.get("toName") || toParam);
    const dateParam = sanitizeInput(params.get("date") || "");
    const classParam = sanitizeInput(params.get("class") || "");

    if (!fromParam || !toParam || !dateParam) {
      setValidationError("Missing required search parameters.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

    const codeRegex = /^[A-Z0-9]{2,6}$/i;
    if (!codeRegex.test(fromParam) || !codeRegex.test(toParam)) {
      setValidationError("Invalid station code format detected. Only letters and numbers are permitted.");
      setIsValidSearch(false);
      setLoading(false);
      return;
    }

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
    setFromName(fromNameParam);
    setToName(toNameParam);
    setDate(dateParam);
    setClassType(classParam);

    fetchTrains(fromParam, toParam);
  }, [location.search]);

  const fetchTrains = async (fCode: string, tCode: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/trn_search?from_stn=${fCode}&to_stn=${tCode}`);
      const data = await res.json();
      if (res.ok) {
        const results = data.results || [];
        setTrains(results);
        setRouteHasTrains(results.length > 0);
      } else {
        setRouteHasTrains(false);
        showToast(data.detail || "No trains found for this route.", "error");
      }
    } catch {
      setRouteHasTrains(false);
      showToast("Could not contact servers. Please check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  };

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
        // Issue 5: If user just logged in and has pending custom passengers, restore them
        // instead of wiping the form they already filled in
        if (pendingPassengersRef.current && pendingPassengersRef.current.length > 0) {
          setPassengers(pendingPassengersRef.current);
          pendingPassengersRef.current = null;
        } else if (list.length === 0) {
          setPassengers([{ name: "", age: "", gender: "Male", isCustom: true }]);
        } else {
          setPassengers([]);
        }
      }
    } catch {
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
      setSelectedClass(null);
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

  const handleDeleteSavedPassenger = async (e: React.MouseEvent, pName: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/saved_passengers/${encodeURIComponent(pName)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast(`Removed ${pName}`, "success");
        await fetchSavedPassengers(true);
        setPassengers(prev => prev.filter(p => p.isCustom || p.name.trim().toLowerCase() !== pName.trim().toLowerCase()));
      } else {
        showToast("Failed to delete", "error");
      }
    } catch (err) {
      showToast("Error deleting", "error");
    }
  };

  const handleEditSavedPassenger = (e: React.MouseEvent, sp: any) => {
    e.stopPropagation();
    setEditingSavedPassenger(sp.name);
    setEditForm({ name: sp.name, age: String(sp.age), gender: sp.gender });
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    const pName = sanitizeInput(editForm.name);
    const pAge = parseInt(editForm.age);
    if (!pName || isNaN(pAge)) return showToast("Valid name and age required", "error");
    
    try {
      const token = await getToken();
      if (pName.toLowerCase() !== editingSavedPassenger?.toLowerCase()) {
         await fetch(`${API_URL}/saved_passengers/${encodeURIComponent(editingSavedPassenger || '')}`, {
           method: "DELETE",
           headers: { Authorization: `Bearer ${token}` }
         });
      }
      
      const res = await fetch(`${API_URL}/saved_passengers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: pName, age: pAge, gender: editForm.gender })
      });
      
      if (res.ok) {
        showToast(`Updated ${pName}`, "success");
        setEditingSavedPassenger(null);
        await fetchSavedPassengers(true);
        // Also update the name in current passengers list if it was selected
        setPassengers(prev => prev.map(p => {
          if (!p.isCustom && p.name.trim().toLowerCase() === (editingSavedPassenger || "").trim().toLowerCase()) {
            return { ...p, name: pName, age: String(pAge), gender: editForm.gender };
          }
          return p;
        }));
      } else {
        showToast("Failed to update", "error");
      }
    } catch (err) {
      showToast("Error updating", "error");
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
    } catch {
      showToast("Error updating saved passenger status", "error");
    } finally {
      setSavingPassengerIndex(null);
    }
  };

  const handleBook = () => {
    if (!user) {
      // Issue 5: Preserve filled passenger data before redirecting to login
      const hasData = passengers.some(p => p.name.trim() || p.age);
      if (hasData) pendingPassengersRef.current = passengers;
      showToast("Please login to continue booking", "warning");
      openSignIn();
      return;
    }
    if (passengers.length === 0) {
      showToast("Please add at least one passenger", "error");
      return;
    }
    // Issue 6: Per-passenger specific validation messages
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      const label = `Passenger ${i + 1}`;
      if (!sanitizeInput(p.name)) {
        showToast(`${label}: Please enter a valid name`, "error");
        return;
      }
      const age = parseInt(p.age);
      if (!p.age || isNaN(age)) {
        showToast(`${label}: Please enter a valid age`, "error");
        return;
      }
      if (age < 1 || age > 120) {
        showToast(`${label}: Age must be between 1 and 120`, "error");
        return;
      }
    }
    setShowPassengerModal(false);
    setShowPaymentModal(true);
  };

  const handleBookingSuccess = (data: any) => {
    setBookingSuccess(data.booking);
    setShowPaymentModal(false);
    showToast("Booking Confirmed! Redirecting to dashboard...", "success");

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

  const checkTrainTypeMatch = (trainType: string, filterType: string): boolean => {
    const t = trainType.toLowerCase();
    const f = filterType.toLowerCase();
    if (f === "vande") return t === "shtb" || t === "jshtb" || t === "raj";
    if (f === "duronto") return t === "drnt";
    if (f === "superfast") return t === "sf" || t === "skr";
    if (f === "express") return t === "exp" || t === "mail" || t === "gr";
    if (f === "passenger") return t === "pass" || t === "demu" || t === "memu" || t === "toy" || t === "klkt" || t === "del" || t === "hyd" || t === "";
    return false;
  };

  const filteredTrains = trains.filter(t => {
    if (classType && t.seat_inventory[classType] === undefined) return false;
    if (showACOnly) {
      const hasAC = ['1AC', '2AC', '3AC'].some(cls => t.seat_inventory[cls] !== undefined);
      if (!hasAC) return false;
    }
    if (selectedTrainTypes.length > 0) {
      const match = selectedTrainTypes.some(type => checkTrainTypeMatch(t.type, type));
      if (!match) return false;
    }
    if (selectedDepartTimes.length > 0) {
      const depHour = parseInt(t.departure.split(":")[0]);
      let timeGroup = "";
      if (depHour >= 0 && depHour < 6) timeGroup = "Night";
      else if (depHour >= 6 && depHour < 12) timeGroup = "Morning";
      else if (depHour >= 12 && depHour < 18) timeGroup = "Afternoon";
      else timeGroup = "Evening";
      if (!selectedDepartTimes.includes(timeGroup)) return false;
    }
    if (showAvailableOnly) {
      const hasAnyWL = Object.values(t.seat_inventory).some(count => count <= 0);
      if (hasAnyWL) return false;
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
      <div style={{ padding: '80px 24px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: "#f8fafc" }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Validation Error</h2>
        <p style={{ color: '#64748b', maxWidth: '480px', marginBottom: '24px' }}>{validationError}</p>
        <button className="btn btn-primary" onClick={() => navigate("/")}>Modify Search</button>
      </div>
    );
  }

  // Use exact theme styling colors
  const ctGreen = "var(--primary)";
  const ctRed = "#ef4444";
  const ctGray = "var(--bg-section)";
  const ctTextDark = "var(--text-main)";
  const ctTextMuted = "var(--text-muted)";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", paddingTop: "80px", paddingBottom: "60px", fontFamily: "var(--sans)" }}>
      


      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 items-start ct-layout" style={{ margin: "24px auto", display: "grid", gridTemplateColumns: trains.length > 0 ? "280px 1fr" : "1fr", gap: "24px" }}>
        
        {/* Left Filters Sidebar — only shown when trains exist */}
        {trains.length > 0 && (
        <aside className="static lg:sticky top-[100px] ct-filters" style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e0e0e0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #e0e0e0", paddingBottom: "12px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: ctTextDark, display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={18} color={ctTextDark} /> Filters
            </h3>
            <button style={{ border: "none", background: "none", color: "var(--primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }} onClick={() => { setSelectedTrainTypes([]); setSelectedDepartTimes([]); setShowAvailableOnly(false); }}>
              RESET
            </button>
          </div>


          <div style={{ marginBottom: "24px" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: ctTextDark, marginBottom: "12px" }}>Departure Time</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { name: "Morning", label: "06:00 - 12:00" },
                { name: "Afternoon", label: "12:00 - 18:00" },
                { name: "Evening", label: "18:00 - 24:00" },
                { name: "Night", label: "00:00 - 06:00" }
              ].map(t => (
                <label key={t.name} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px", cursor: "pointer", color: ctTextMuted }}>
                  <input type="checkbox" checked={selectedDepartTimes.includes(t.name)} onChange={() => toggleDepartTimeFilter(t.name)} style={{ width: "18px", height: "18px", accentColor: ctGreen }} />
                  {t.name} <span style={{ fontSize: "12px", color: "#9e9e9e" }}>({t.label})</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: ctTextDark, marginBottom: "12px" }}>Train Type</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {["Vande", "Duronto", "Superfast", "Express", "Passenger"].map(type => (
                <label key={type} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px", cursor: "pointer", color: ctTextMuted }}>
                  <input type="checkbox" checked={selectedTrainTypes.includes(type)} onChange={() => toggleTrainTypeFilter(type)} style={{ width: "18px", height: "18px", accentColor: ctGreen }} />
                  {type}
                </label>
              ))}
            </div>
          </div>
        </aside>
        )}

        {/* Right Train List Results */}
        <section style={{ overflow: "hidden" }}>
          
          {/* Main Content Header Elements */}
          <div className="mb-6">
            <h1 style={{ fontSize: "24px", fontWeight: 700, color: ctTextDark, margin: "0 0 4px 0" }}>{fromName} to {toName} Trains</h1>
            <p style={{ fontSize: "14px", color: ctTextMuted, margin: 0 }}>{filteredTrains.length} Trains found between {fromCode} and {toCode}</p>
          </div>

          {/* Date Carousel */}
          <div style={{ display: "flex", background: "white", borderRadius: "8px", border: "1px solid #e0e0e0", marginBottom: "16px", overflow: "hidden" }}>
            
            {/* Left Month Indicator */}
            <div style={{ width: "36px", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #e0e0e0", background: "#fafafa" }}>
              <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "12px", color: ctTextDark, fontWeight: 500, letterSpacing: "1px" }}>
                {new Date(date).toLocaleString('default', { month: 'short' })}
              </span>
            </div>

            {/* Scrolling Dates */}
            <div style={{ flex: 1, display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
              {Array.from({length: 6}).map((_, i) => {
                const d = new Date(date);
                d.setDate(d.getDate() + i);
                const isSelected = i === 0;

                const maxDateObj = new Date();
                maxDateObj.setDate(maxDateObj.getDate() + 60);
                maxDateObj.setHours(23, 59, 59, 999);
                const isDisabled = d > maxDateObj;

                const today = new Date();
                today.setHours(0,0,0,0);
                const target = new Date(d);
                target.setHours(0,0,0,0);
                const daysFromToday = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                const seed = d.getDate() * 13 + d.getMonth() * 31 + (fromCode.charCodeAt(0) || 0) + (toCode.charCodeAt(0) || 0);
                let val = seed % 100;
                
                // More seats available the further out you book
                val = Math.max(0, val - daysFromToday);

                // If no trains found for this route, show '—' to avoid misleading the user
                let availText = "—";
                let availColor = "#9e9e9e";
                if (routeHasTrains === true) {
                  availText = "Available";
                  availColor = ctGreen;
                  if (val > 80) {
                    availText = "Few Seats";
                    availColor = ctRed;
                  } else if (val > 50) {
                    availText = "Few Seats";
                    availColor = "#d97706";
                  }
                } else if (routeHasTrains === null) {
                  // Still loading — show neutral dashes
                  availText = "—";
                  availColor = "#9e9e9e";
                }

                return (
                  <div 
                    key={i} 
                    onClick={() => {
                      if (!isSelected && !isDisabled) {
                        const dStr = d.toISOString().split('T')[0];
                        navigate(`/trains?from=${fromCode}&to=${toCode}&fromName=${encodeURIComponent(fromName)}&toName=${encodeURIComponent(toName)}&date=${dStr}${classType ? `&class=${classType}` : ''}`);
                      }
                    }}
                    style={{ flex: "1 0 80px", textAlign: "center", padding: "10px 4px", borderBottom: isSelected ? `3px solid ${ctGreen}` : "3px solid transparent", cursor: isDisabled ? "not-allowed" : "pointer", color: isDisabled ? "#bdbdbd" : (isSelected ? ctGreen : ctTextMuted), transition: "all 0.2s", display: "flex", flexDirection: "column", justifyContent: "center" }}
                    onMouseOver={e => { if(!isSelected && !isDisabled) e.currentTarget.style.background = "#f5f5f5"; }}
                    onMouseOut={e => { if(!isSelected && !isDisabled) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: 500, paddingBottom: "2px" }}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short' })}, {d.toLocaleDateString('en-GB', { day: '2-digit' })}
                    </div>
                    {!isDisabled ? (
                      <div style={{ fontSize: "11px", color: availColor, fontWeight: 600 }}>
                        {routeHasTrains === true && <span style={{ fontSize: "14px", marginRight: "2px", verticalAlign: "middle" }}>•</span>}{availText}
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "#bdbdbd", fontWeight: 600 }}>
                        Unavailable

                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Interactive Calendar Icon */}
            <div 
              style={{ width: "48px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #e0e0e0", background: "white", cursor: "pointer", flexShrink: 0 }} 
              title="Choose Custom Date"
              onClick={() => { setPickerMonth(new Date(date)); setShowDatePicker(true); }}
            >
              <Calendar size={20} color={ctTextDark} />
            </div>
          </div>

          {/* Quick Filters — only shown when trains exist */}
          {trains.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "24px", background: "white", borderRadius: "8px", border: "1px solid #e0e0e0", padding: "16px", marginBottom: "24px", overflowX: "auto", scrollbarWidth: "none" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: ctTextDark, whiteSpace: "nowrap" }}>Quick Filters</span>
            
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" className="sr-only" checked={showAvailableOnly} onChange={e => setShowAvailableOnly(e.target.checked)} />
              <div style={{ width: "36px", height: "20px", borderRadius: "20px", background: showAvailableOnly ? ctGreen : "#e0e0e0", position: "relative", transition: "all 0.2s" }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "white", position: "absolute", top: "2px", left: showAvailableOnly ? "18px" : "2px", transition: "all 0.2s" }}></div>
              </div>
              <span style={{ fontSize: "14px", fontWeight: 500, color: ctTextMuted }}>Best Available</span>
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" className="sr-only" checked={showACOnly} onChange={e => setShowACOnly(e.target.checked)} />
              <div style={{ width: "36px", height: "20px", borderRadius: "20px", background: showACOnly ? ctGreen : "#e0e0e0", position: "relative", transition: "all 0.2s" }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "white", position: "absolute", top: "2px", left: showACOnly ? "18px" : "2px", transition: "all 0.2s" }}></div>
              </div>
              <span style={{ fontSize: "14px", fontWeight: 500, color: ctTextMuted }}>AC Only</span>
            </label>
          </div>
          )}

          {/* Free Cancellation Banner — only shown when trains exist */}
          {trains.length > 0 && (
          <div onClick={() => setIsFreeCancellation(!isFreeCancellation)} style={{ background: "linear-gradient(90deg, var(--primary) 0%, #10b981 100%)", borderRadius: "8px", padding: "16px 24px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", boxShadow: "0 4px 12px var(--primary-glow)", cursor: "pointer", transition: "transform 0.1s", transform: isFreeCancellation ? "scale(0.99)" : "scale(1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "22px", height: "22px", border: "2px solid rgba(255,255,255,0.8)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", background: isFreeCancellation ? "white" : "transparent" }}>
                {isFreeCancellation && <Check size={16} color="var(--primary)" />}
              </div>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 2px 0" }}>Free Cancellation</h3>
                <p style={{ fontSize: "13px", opacity: 0.9, margin: 0 }}>Get full refund on cancellation (+₹99/pax)</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyItems: "center", background: "rgba(0,0,0,0.15)", borderRadius: "50%", padding: "10px" }}>
              <ShieldCheck size={28} />
            </div>
          </div>
          )}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e0e0e0" }}>
                  <div className="shimmer-box shimmer-line-lg" style={{ width: "250px", height: "24px", marginBottom: "16px" }} />
                  <div className="shimmer-box" style={{ width: "100%", height: "80px", borderRadius: "8px" }} />
                </div>
              ))}
            </div>
          ) : filteredTrains.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 24px", background: "white", borderRadius: "8px", border: "1px solid #e0e0e0", textAlign: "center" }}>
              <Train size={64} color="#e0e0e0" style={{ marginBottom: "16px" }} />
              <h3 style={{ fontSize: "20px", fontWeight: 700, color: ctTextDark, marginBottom: "8px" }}>No Trains Found</h3>
              <p style={{ color: ctTextMuted, maxWidth: "380px" }}>We couldn't find any trains matching your filters. Please try modifying your search.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {filteredTrains.map((train) => (
                <div key={train.train_number} style={{ background: "white", borderRadius: "8px", border: "1px solid #e0e0e0", overflow: "hidden", transition: "box-shadow 0.2s" }} onMouseOver={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"} onMouseOut={e => e.currentTarget.style.boxShadow = "none"}>
                  
                  {/* Train Card Header */}
                  <div className="flex flex-col md:flex-row justify-between md:flex-wrap gap-4" style={{ padding: "16px 20px", borderBottom: "1px solid #f5f5f5" }}>
                    <div style={{ flex: "1 1 auto" }}>
                      <div className="flex items-center flex-wrap gap-3 mb-2">
                        <h3 style={{ fontSize: "18px", fontWeight: 700, color: ctTextDark, margin: 0 }}>{train.train_name}</h3>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: ctTextMuted, background: ctGray, padding: "2px 8px", borderRadius: "4px" }}>{train.train_number}</span>
                      </div>
                      <div className="flex items-center justify-between md:justify-start gap-4 md:gap-6 mt-4 md:mt-0">
                        <div style={{ textAlign: "left" }}>
                          <span style={{ fontSize: "18px", fontWeight: 700, color: ctTextDark, display: "block" }}>{train.departure}</span>
                          <span style={{ fontSize: "12px", color: ctTextMuted }}>{fromCode}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "100px" }}>
                          <span style={{ fontSize: "12px", color: ctTextMuted }}>{formatDuration(train.duration_h, train.duration_m)}</span>
                          <div style={{ height: "1px", background: "#bdbdbd", width: "100%", margin: "4px 0", position: "relative" }}>
                            <div style={{ position: "absolute", right: -4, top: -3, width: 6, height: 6, borderRadius: "50%", background: "#bdbdbd" }}></div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "18px", fontWeight: 700, color: ctTextDark, display: "block" }}>{train.arrival}</span>
                          <span style={{ fontSize: "12px", color: ctTextMuted }}>{toCode}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center mt-2 md:mt-0 pt-3 md:pt-0 border-t border-gray-100 md:border-none">
                      <div style={{ display: "flex", gap: "4px", fontSize: "12px", fontWeight: 600 }}>
                        {["M", "T", "W", "T", "F", "S", "S"].map((day, dIdx) => {
                          const runs = getRunsOnDays(train.train_number)[dIdx];
                          return (
                            <span key={dIdx} style={{ color: runs ? ctGreen : "#e0e0e0" }}>{day}</span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Seat Class Inventory Scrollable Row */}
                  <div style={{ padding: "16px 20px", display: "flex", gap: "12px", overflowX: "auto", scrollbarWidth: "none" }}>
                    {Object.entries(train.seat_inventory as Record<string, number>)
                      .filter(([cls]) => !classType || cls === classType)
                      .filter(([cls]) => showACOnly ? ['1AC', '2AC', '3AC'].includes(cls) : true)
                      .map(([cls, count]) => {
                        const fare = train.fares?.[cls] || 0;
                        const isSelect = selectedTrain?.train_number === train.train_number && selectedClass === cls;
                        const isAvail = count > 0;
                        const statusColor = isAvail ? ctGreen : ctRed;
                        const prob = train.wl_probabilities?.[cls];
                        
                        return (
                          <div key={cls} onClick={() => { setSelectedTrain(train); setSelectedClass(cls); }} style={{ 
                            minWidth: "140px", 
                            padding: "12px", 
                            borderRadius: "6px", 
                            border: `1px solid ${isSelect ? ctGreen : "#e0e0e0"}`, 
                            background: isSelect ? "var(--primary-light)" : "white", 
                            cursor: "pointer", 
                            display: "flex", 
                            flexDirection: "column", 
                            gap: "8px",
                            transition: "all 0.2s"
                          }} onMouseOver={e => { if(!isSelect) e.currentTarget.style.borderColor = "#bdbdbd"; }} onMouseOut={e => { if(!isSelect) e.currentTarget.style.borderColor = "#e0e0e0"; }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "14px", fontWeight: 700, color: ctTextDark }}>{cls}</span>
                              <span style={{ fontSize: "14px", fontWeight: 600, color: ctTextDark }}>₹{fare}</span>
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: statusColor }}>
                              {isAvail ? `AVL ${count}` : `WL ${Math.abs(count) + 1}`}
                            </div>
                            {!isAvail && prob && (
                              <div style={{ fontSize: "11px", color: parseInt(prob) >= 70 ? ctGreen : parseInt(prob) >= 40 ? "#FF9800" : ctRed, fontWeight: 600 }}>
                                Chance: {prob}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {selectedTrain?.train_number === train.train_number && selectedClass && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" style={{ background: "#f9fafb", padding: "16px 20px", borderTop: "1px solid #e0e0e0" }}>
                      <div>
                        <div style={{ fontSize: "14px", color: ctTextDark }}>Selected Class: <strong style={{ color: ctGreen }}>{selectedClass}</strong></div>
                        <div style={{ fontSize: "12px", color: ctTextMuted }}>Fare per passenger: ₹{train.fares?.[selectedClass]}</div>
                      </div>
                      <button onClick={() => setShowPassengerModal(true)} className="w-full sm:w-auto justify-center" style={{ background: ctGreen, color: "white", border: "none", padding: "10px 24px", borderRadius: "4px", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 2px 6px var(--primary-glow)" }}>
                        Book Now <ArrowRight size={16} />
                      </button>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Booking Passenger Modal - ConfirmTkt Style */}
      <AnimatePresence>
        {showPassengerModal && !bookingSuccess && selectedTrain && selectedClass && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setShowPassengerModal(false)}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "8px", width: "100%", maxWidth: "650px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
              
              <div style={{ background: ctGreen, padding: "16px 24px", borderTopLeftRadius: "8px", borderTopRightRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "white" }}>
                <div>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Review Passenger Details</h2>
                  <p style={{ fontSize: "13px", margin: "4px 0 0 0", opacity: 0.9 }}>{selectedTrain.train_name} | {fromCode} to {toCode} | {selectedClass}</p>
                </div>
                <button style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "4px" }} onClick={() => setShowPassengerModal(false)}><X size={24} /></button>
              </div>

              <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
                {!user && (
                  <div style={{ background: "#FFF3E0", border: "1px solid #FFE0B2", padding: "12px 16px", borderRadius: "4px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
                    <AlertCircle size={20} color="#F57C00" />
                    <span style={{ fontSize: "14px", color: "#E65100" }}>Login to access saved passengers and manage your bookings easily.</span>
                  </div>
                )}

                {user && savedPassengers.length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h4 style={{ fontSize: "15px", fontWeight: 700, color: ctTextDark, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}><UserPlus size={18} /> Select Saved Passengers</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                      {savedPassengers.map(sp => {
                        if (editingSavedPassenger === sp.name) {
                          return (
                            <div key={sp.name} style={{ padding: "12px", border: `1px solid ${ctGreen}`, borderRadius: "4px", background: "white", display: "flex", flexDirection: "column", gap: "8px" }} onClick={e => e.stopPropagation()}>
                              <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ padding: "6px", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px" }} placeholder="Name" />
                              <div style={{ display: "flex", gap: "8px" }}>
                                <input
                                  type="number"
                                  value={editForm.age}
                                  min={1}
                                  max={120}
                                  onChange={e => {
                                    const v = parseInt(e.target.value);
                                    if (e.target.value === '') { setEditForm({...editForm, age: ''}); return; }
                                    if (!isNaN(v)) setEditForm({...editForm, age: String(Math.min(120, Math.max(1, v)))});
                                  }}
                                  style={{ padding: "6px", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px", width: "60px" }}
                                  placeholder="Age"
                                />
                                <select value={editForm.gender} onChange={e => setEditForm({...editForm, gender: e.target.value})} style={{ padding: "6px", border: "1px solid #e0e0e0", borderRadius: "4px", fontSize: "13px", flex: 1 }}>
                                  <option>Male</option><option>Female</option><option>Other</option>
                                </select>
                              </div>
                              <div className="flex justify-end gap-2 mt-1">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setEditingSavedPassenger(null); }} style={{ fontSize: "12px", color: ctTextMuted, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }} style={{ fontSize: "12px", color: "white", background: ctGreen, padding: "4px 12px", borderRadius: "4px", border: "none", cursor: "pointer", fontWeight: 600 }}>Save</button>
                              </div>
                            </div>
                          );
                        }

                        const isSelect = passengers.some(p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase() && !p.isCustom);
                        return (
                          <div key={sp.name} onClick={() => toggleSavedPassenger(sp)} style={{ padding: "12px", border: `1px solid ${isSelect ? ctGreen : "#e0e0e0"}`, borderRadius: "4px", background: isSelect ? "var(--primary-light)" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div style={{ width: "18px", height: "18px", border: `1.5px solid ${isSelect ? ctGreen : "#9e9e9e"}`, borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", background: isSelect ? ctGreen : "transparent" }}>
                                {isSelect && <Check size={14} color="white" fontWeight={700} />}
                              </div>
                              <div>
                                <div style={{ fontSize: "14px", fontWeight: 600, color: ctTextDark }}>{sp.name}</div>
                                <div style={{ fontSize: "12px", color: ctTextMuted }}>{sp.age} yrs, {sp.gender}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                               <button type="button" onClick={(e) => handleEditSavedPassenger(e, sp)} style={{ background: "none", border: "none", cursor: "pointer", color: ctTextMuted }} title="Edit"><Edit2 size={14} /></button>
                               <button type="button" onClick={(e) => handleDeleteSavedPassenger(e, sp.name)} style={{ background: "none", border: "none", cursor: "pointer", color: ctRed }} title="Delete"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "12px" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, color: ctTextDark, marginBottom: "12px" }}>Passenger Information</h4>
                  {passengers.map((p, i) => {
                    const isCustom = !user || savedPassengers.length === 0 || p.isCustom;
                    if (!isCustom) return null;
                    const isSaved = savedPassengers.some(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                    return (
                      <div key={i} style={{ border: "1px solid #e0e0e0", padding: "16px", borderRadius: "4px", marginBottom: "12px", background: "#fafafa", position: "relative" }}>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px_120px] gap-4 items-end pr-14 sm:pr-0">
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: 600, color: ctTextMuted, marginBottom: "6px", display: "block" }}>Full Name</label>
                            <input type="text" value={p.name} onChange={e => { const newP = [...passengers]; newP[i].name = e.target.value; setPassengers(newP); }} style={{ width: "100%", padding: "10px 12px", border: "1px solid #bdbdbd", borderRadius: "4px", fontSize: "14px" }} placeholder="As per ID" />
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: 600, color: ctTextMuted, marginBottom: "6px", display: "block" }}>Age</label>
                            <input
                              type="number"
                              value={p.age}
                              min={1}
                              max={120}
                              onChange={e => {
                                const newP = [...passengers];
                                const v = parseInt(e.target.value);
                                if (e.target.value === '') { newP[i].age = ''; setPassengers(newP); return; }
                                if (!isNaN(v)) { newP[i].age = String(Math.min(120, Math.max(1, v))); setPassengers(newP); }
                              }}
                              style={{ width: "100%", padding: "10px 12px", border: "1px solid #bdbdbd", borderRadius: "4px", fontSize: "14px" }}
                              placeholder="Yrs"
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", fontWeight: 600, color: ctTextMuted, marginBottom: "6px", display: "block" }}>Gender</label>
                            <select value={p.gender} onChange={e => { const newP = [...passengers]; newP[i].gender = e.target.value; setPassengers(newP); }} style={{ width: "100%", padding: "10px 12px", border: "1px solid #bdbdbd", borderRadius: "4px", fontSize: "14px", background: "white" }}>
                              <option>Male</option>
                              <option>Female</option>
                              <option>Other</option>
                            </select>
                          </div>
                        </div>
                        <div className="absolute top-4 right-4 flex items-center gap-3">
                          {user && p.name.trim() && (
                            <button type="button" onClick={() => toggleSaveToProfile(p, i)} disabled={savingPassengerIndex === i} style={{ background: "none", border: "none", cursor: "pointer", color: isSaved ? "#eab308" : "#9e9e9e" }} title="Save to Profile">
                              <Star size={18} fill={isSaved ? "#eab308" : "none"} />
                            </button>
                          )}
                          <button type="button" onClick={() => setPassengers(prev => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: ctRed, cursor: "pointer" }} title="Remove">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setPassengers([...passengers, { name: "", age: "", gender: "Male", isCustom: true }])} style={{ background: "transparent", border: "1px dashed #bdbdbd", color: ctTextDark, width: "100%", padding: "12px", borderRadius: "4px", fontSize: "14px", fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
                    <UserPlus size={16} /> Add Another Passenger
                  </button>
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--primary-light)", padding: "12px", borderRadius: "4px", marginTop: "24px" }}>
                  <ShieldCheck size={20} color={ctGreen} />
                  <span style={{ fontSize: "13px", color: ctTextDark, fontWeight: 500 }}>Railyn Secure Booking. 100% secure payment.</span>
                </div>
              </div>

              <div style={{ padding: "16px 24px", borderTop: "1px solid #e0e0e0", background: "white", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottomLeftRadius: "8px", borderBottomRightRadius: "8px" }}>
                <div>
                  <div style={{ fontSize: "13px", color: ctTextMuted }}>Total Amount</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: ctTextDark }}>₹{((selectedTrain.fares?.[selectedClass] || 0) + (isFreeCancellation ? 99 : 0)) * passengers.length}</div>
                </div>
                <button onClick={handleBook} style={{ background: ctGreen, color: "white", border: "none", padding: "12px 32px", borderRadius: "4px", fontSize: "15px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 12px var(--primary-glow)" }}>
                  Pay & Book Now
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Payment Processing UI (Simulated or Real Razorpay) */}
        {showPaymentModal && user && !bookingSuccess && selectedTrain && selectedClass && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setShowPaymentModal(false)}>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "16px", width: "100%", maxWidth: "500px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", overflowY: "auto" }}>
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
                onCancel={() => {
                  setShowPaymentModal(false);
                  setShowPassengerModal(true);
                }}
                apiUrl={API_URL}
                razorpayKeyId={import.meta.env.VITE_RAZORPAY_KEY_ID}
              />
            </motion.div>
          </div>
        )}

        {/* E-Ticket Display */}
        {bookingSuccess && selectedTrain && selectedClass && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "transparent", maxWidth: "520px", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
              <div style={{ display: "flex", justifyContent: "center", marginTop: "20px", width: "100%" }}>
                <button 
                  onClick={() => { 
                    setSelectedTrain(null); 
                    setSelectedClass(null); 
                    setBookingSuccess(null); 
                  }} 
                  style={{ 
                    width: "100%",
                    background: "var(--primary)", 
                    color: "white", 
                    border: "none", 
                    padding: "14px 0", 
                    borderRadius: "12px", 
                    fontSize: "16px", 
                    fontWeight: 700, 
                    cursor: "pointer",
                    boxShadow: "0 4px 15px rgba(30, 111, 43, 0.25)",
                    transition: "all 0.2s",
                    fontFamily: "var(--heading)"
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "var(--secondary)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseOut={e => { e.currentTarget.style.background = "var(--primary)"; e.currentTarget.style.transform = "none"; }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Date Picker Modal */}
        {showDatePicker && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowDatePicker(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "380px", padding: "24px", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                {(() => {
                  const today = new Date();
                  const isMinMonth = pickerMonth.getMonth() === today.getMonth() && pickerMonth.getFullYear() === today.getFullYear();
                  
                  const maxDate = new Date();
                  maxDate.setDate(maxDate.getDate() + 60);
                  const isMaxMonth = pickerMonth.getMonth() === maxDate.getMonth() && pickerMonth.getFullYear() === maxDate.getFullYear();

                  return (
                    <>
                      <button 
                        onClick={() => !isMinMonth && setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))} 
                        style={{ background: "none", border: "none", cursor: isMinMonth ? "not-allowed" : "pointer", padding: "8px", opacity: isMinMonth ? 0.3 : 1 }}
                        disabled={isMinMonth}
                      >
                        <ChevronLeft size={20} color={ctTextDark} />
                      </button>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: ctTextDark }}>
                        {pickerMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </div>
                      <button 
                        onClick={() => !isMaxMonth && setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))} 
                        style={{ background: "none", border: "none", cursor: isMaxMonth ? "not-allowed" : "pointer", padding: "8px", opacity: isMaxMonth ? 0.3 : 1 }}
                        disabled={isMaxMonth}
                      >
                        <ChevronRight size={20} color={ctTextDark} />
                      </button>
                    </>
                  );
                })()}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", marginBottom: "16px", textAlign: "center" }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} style={{ fontSize: "12px", color: ctTextMuted, fontWeight: 500 }}>{d}</div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", textAlign: "center" }}>
                {generateCalendarGrid().map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} />;
                  const isSelected = d.toISOString().split('T')[0] === new Date(date).toISOString().split('T')[0];
                  const isPast = d < new Date(new Date().setHours(0,0,0,0));
                  
                  const maxDateObj = new Date();
                  maxDateObj.setDate(maxDateObj.getDate() + 60);
                  maxDateObj.setHours(23, 59, 59, 999);
                  const isFutureLimit = d > maxDateObj;
                  const isDisabled = isPast || isFutureLimit;
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (isDisabled) return;
                        const dStr = d.toISOString().split('T')[0];
                        navigate(`/trains?from=${fromCode}&to=${toCode}&date=${dStr}${classType ? `&class=${classType}` : ''}`);
                        setShowDatePicker(false);
                      }}
                      style={{ aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", fontSize: "14px", fontWeight: isSelected ? 700 : 500, background: isSelected ? ctGreen : "transparent", color: isSelected ? "white" : (isDisabled ? "#bdbdbd" : ctTextDark), cursor: isDisabled ? "not-allowed" : "pointer", transition: "all 0.2s" }}
                      onMouseOver={e => { if(!isSelected && !isDisabled) e.currentTarget.style.background = "#f5f5f5"; }}
                      onMouseOut={e => { if(!isSelected && !isDisabled) e.currentTarget.style.background = "transparent"; }}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Trains;
