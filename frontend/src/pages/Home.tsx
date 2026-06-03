import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { 
  Search, MapPin, Calendar, Train, Clock, X, Star, Trash2, 
  ArrowLeftRight, AlertCircle, Activity, 
  Info, ArrowRight,
  ChevronLeft, ChevronRight
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ETicket from "../components/Ticket";
import PaymentModal from "../components/PaymentModal";
import { formatDate } from "../utils/dateUtils";
import { useToast } from "../components/ui/toast-1";

import mumbaiImg from "../assets/mumbai.png";
import kolkataImg from "../assets/kolkata.png";
import delhiImg from "../assets/delhi.png";
import vandeBharatImg from "../assets/vande_bharat.png";
import bengaluruImg from "../assets/bengaluru.png";
import chennaiImg from "../assets/chennai.png";
import puriImg from "../assets/puri.png";
import goaImg from "../assets/goa.png";

const API_URL = import.meta.env.VITE_API_URL;

interface Station {
  code: string;
  name: string;
}

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

interface ChartResult {
  train_number: string;
  train: string;
  coaches: Array<{
    coach: string;
    class_name: string;
    available: number;
    seats: Array<{
      number: number;
      berth_type: string;
      is_occupied: boolean;
    }>;
  }>;
}

interface Passenger {
  name: string;
  age: string;
  gender: string;
  isCustom?: boolean;
}

const getRunsOnDays = (trainNumber: string): boolean[] => {
  // Deterministic schedule based on train number digits
  const digitsSum = trainNumber.split('').reduce((sum, ch) => sum + (parseInt(ch, 10) || 0), 0);
  
  // Weekly running configurations (true means active day, index 0 is Monday, index 6 is Sunday)
  const patterns = [
    [true, true, true, true, true, true, true],     // Daily
    [true, true, true, true, true, true, false],    // Except Sunday
    [true, false, true, false, true, false, false], // Mon, Wed, Fri
    [false, true, false, true, false, true, false], // Tue, Thu, Sat
    [false, false, false, false, false, true, true], // Weekend only
    [true, true, true, true, true, false, false],   // Weekdays only
    [true, false, false, true, false, false, true], // Mon, Thu, Sun
  ];
  
  // Select pattern deterministically
  const patternIndex = digitsSum % patterns.length;
  return patterns[patternIndex];
};

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const POPULAR_ROUTES = [
  { id: "dr-ypr", from: "DR", to: "YPR", nameFrom: "Mumbai Dadar", nameTo: "Yesvantpur", img: bengaluruImg, fallbackType: "Express", fallbackFare: 620, fallbackDuration: "23h 30m", fromFull: "DR - MUMBAI DADAR CENTRAL", toFull: "YPR - YESVANTPUR JN" },
  { id: "cstm-mas", from: "CSTM", to: "MAS", nameFrom: "Mumbai CST", nameTo: "Chennai Central", img: chennaiImg, fallbackType: "Mail Express", fallbackFare: 750, fallbackDuration: "28h 15m", fromFull: "CSTM - MUMBAI CST", toFull: "MAS - CHENNAI CENTRAL" },
  { id: "ltt-cpr", from: "LTT", to: "CPR", nameFrom: "Mumbai LTT", nameTo: "Chhapra", img: kolkataImg, fallbackType: "Superfast", fallbackFare: 840, fallbackDuration: "31h 40m", fromFull: "LTT - LOKMANYA TILAK TERM", toFull: "CPR - CHHAPRA" },
  { id: "jat-uhp", from: "JAT", to: "UHP", nameFrom: "Jammu Tawi", nameTo: "Udhampur", img: mumbaiImg, fallbackType: "Passenger", fallbackFare: 120, fallbackDuration: "1h 20m", fromFull: "JAT - JAMMU TAWI", toFull: "UHP - UDHAMPUR" },
  { id: "hwh-puri", from: "HWH", to: "PURI", nameFrom: "Howrah Jn", nameTo: "Puri", img: puriImg, fallbackType: "Express", fallbackFare: 450, fallbackDuration: "8h 15m", fromFull: "HWH - HOWRAH JN", toFull: "PURI - PURI" },
  { id: "hwh-dgha", from: "HWH", to: "DGHA", nameFrom: "Howrah Jn", nameTo: "Digha", img: vandeBharatImg, fallbackType: "AC Duronto", fallbackFare: 350, fallbackDuration: "3h 25m", fromFull: "HWH - HOWRAH JN", toFull: "DGHA - Digha Flag Station" },
  { id: "hwh-vsg", from: "HWH", to: "VSG", nameFrom: "Howrah Jn", nameTo: "Vasco Da Gama", img: goaImg, fallbackType: "Amravati Exp", fallbackFare: 1120, fallbackDuration: "37h 30m", fromFull: "HWH - HOWRAH JN", toFull: "VSG - VASCO DA GAMA" },
  { id: "hwh-cstm", from: "HWH", to: "CSTM", nameFrom: "Howrah Jn", nameTo: "Mumbai CST", img: delhiImg, fallbackType: "SF Mail", fallbackFare: 920, fallbackDuration: "33h 0m", fromFull: "HWH - HOWRAH JN", toFull: "CSTM - MUMBAI CST" }
];

const Home = () => {
  const [activeTab, setActiveTab] = useState("book");
  const { getToken } = useAuth();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [fromStn, setFromStn] = useState("");
  const [toStn, setToStn] = useState("");
  const [date, setDate] = useState(localToday());
  const [classType, setClassType] = useState("");
  
  const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Station[]>([]);
  const [trains, setTrains] = useState<TrainData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([{ name: "", age: "", gender: "Male" }]);
  const [savedPassengers, setSavedPassengers] = useState<any[]>([]);
  const [savingPassengerIndex, setSavingPassengerIndex] = useState<number | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<BookingData | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [pnrInput, setPnrInput] = useState("");
  const [pnrResult, setPnrResult] = useState<BookingData | null>(null);
  const [pnrLoading, setPnrLoading] = useState(false);
  const [chartTrain, setChartTrain] = useState("");
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<any | null>(null);
  const [swapRotation, setSwapRotation] = useState(0);
  const [chartDate, setChartDate] = useState(localToday());
  const [viewingTicket, setViewingTicket] = useState<BookingData | null>(null);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const carouselRef = React.useRef<HTMLDivElement>(null);
  const [routeInfoMap, setRouteInfoMap] = useState<Record<string, { type: string; minFare: number; duration: string }>>({});

  useEffect(() => {
    const fetchRouteData = async () => {
      const updatedMap: Record<string, { type: string; minFare: number; duration: string }> = {};
      
      await Promise.all(
        POPULAR_ROUTES.map(async (route) => {
          try {
            const res = await fetch(`${API_URL}/trn_search?from_stn=${route.from}&to_stn=${route.to}`);
            if (res.ok) {
              const trainsList = await res.json();
              if (trainsList && trainsList.length > 0) {
                const firstTrain = trainsList[0];
                const trainType = firstTrain.type || route.fallbackType;
                
                let minFare = route.fallbackFare;
                if (firstTrain.fares) {
                  const faresList = Object.values(firstTrain.fares) as number[];
                  if (faresList.length > 0) {
                    minFare = Math.min(...faresList);
                  }
                }
                
                const duration = `${firstTrain.duration_h || 0}h ${firstTrain.duration_m || 0}m`;
                
                updatedMap[route.id] = {
                  type: trainType,
                  minFare,
                  duration
                };
                return;
              }
            }
          } catch (err) {
            console.error(`Error fetching route data for ${route.from}->${route.to}:`, err);
          }
          updatedMap[route.id] = {
            type: route.fallbackType,
            minFare: route.fallbackFare,
            duration: route.fallbackDuration
          };
        })
      );
      
      setRouteInfoMap(updatedMap);
    };
    
    fetchRouteData();
  }, []);

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 344; // card width (320px) + gap (24px)
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  const filteredTrains = trains.filter(train => {
    if (!classType) return true;
    return train.seat_inventory && train.seat_inventory[classType] !== undefined;
  });

  useEffect(() => {
    const registerUser = async () => {
      if (user) {
        const token = await getToken();
        await fetch(`${API_URL}/register_user`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            email: user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName,
            last_name: user.lastName,
            image_url: user.imageUrl
          })
        });
      }
    };
    registerUser();

    // Support URL parameters for pre-filling search (e.g. Book Again)
    const params = new URLSearchParams(window.location.search);
    const f = params.get('from');
    const t = params.get('to');
    const d = params.get('date');
    const tab = params.get('tab');
    if (f) setFromStn(f);
    if (t) setToStn(t);
    if (d) setDate(d);
    if (tab && ["book", "pnr", "charts"].includes(tab)) {
      setActiveTab(tab);
      setTimeout(() => {
        const element = document.getElementById("widget-container");
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [user, getToken]);

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
          setPassengers([]); // Clear list so user can check cards to add them
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
    if (!passenger.name.trim() || !passenger.age) {
      return showToast("Name and Age are required to save", "error");
    }

    setSavingPassengerIndex(index);
    const isSaved = savedPassengers.some(sp => sp.name.trim().toLowerCase() === passenger.name.trim().toLowerCase());
    const token = await getToken();

    try {
      if (isSaved) {
        const res = await fetch(`${API_URL}/saved_passengers/${encodeURIComponent(passenger.name.trim())}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          showToast(`Removed ${passenger.name} from saved list`, "success");
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
            name: passenger.name.trim(),
            age: parseInt(passenger.age),
            gender: passenger.gender
          })
        });
        if (res.ok) {
          showToast(`Saved ${passenger.name} to profile`, "success");
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

  const handleStationSearch = async (query: string, setSuggestions: React.Dispatch<React.SetStateAction<Station[]>>) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const res = await fetch(`${API_URL}/stn_search?q=${query}`);
    const data = await res.json();
    setSuggestions(data.results || []);
  };

  const performSearch = async (fromVal: string, toVal: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/trn_search?from_stn=${fromVal.split(' - ')[0]}&to_stn=${toVal.split(' - ')[0]}`);
      const data = await res.json();
      setTrains(data.results || []);
      setShowResults(true);
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
      showToast("Error searching trains", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!fromStn || !toStn) return;
    if (date < localToday()) {
      showToast("Travel date cannot be in the past.", "error");
      return;
    }
    await performSearch(fromStn, toStn);
  };

  const handleQuickBook = async (fromStnFull: string, toStnFull: string) => {
    setFromStn(fromStnFull);
    setToStn(toStnFull);
    setDate(localToday());
    setFromSuggestions([]);
    setToSuggestions([]);
    
    // Switch to search tab
    setActiveTab("book");
    
    const fromCode = fromStnFull.split(' - ')[0];
    const toCode = toStnFull.split(' - ')[0];
    await performSearch(fromCode, toCode);
  };

  const handleBook = async () => {
    if (!user) {
      showToast("Please login to book tickets", "warning");
      openSignIn();
      return;
    }
    if (passengers.some(p => !p.name || !p.age)) {
      showToast("Please fill all passenger details", "error");
      return;
    }
    setShowPayment(true);
  };

  const handleBookingSuccess = (data: any) => {
    setBookingSuccess(data.booking);
    setShowPayment(false);
    showToast("Booking Confirmed! Redirecting to dashboard...", "success");

    // Local UI update: Decrement the seat count
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

    // Redirect to dashboard after showing the ticket
    setTimeout(() => {
      navigate("/dashboard");
    }, 4500);
  };

  const checkPnrStatus = async () => {
    if (!pnrInput) return;
    setPnrLoading(true);
    setPnrResult(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${import.meta.env.VITE_API_URL}/pnr_status/${pnrInput}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setPnrResult(data.booking);
        showToast("PNR Status Found", "success");
      }
      else showToast(data.detail || "PNR not found", "error");
    } catch (err) {
      console.error(err);
      showToast("Error fetching PNR status", "error");
    } finally {
      setPnrLoading(false);
    }
  };

  const getChartStatus = async () => {
    if (!chartTrain) return;
    setChartLoading(true);
    setChartResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/train_chart/${chartTrain}?date=${chartDate}`);
      const data = await res.json();
      if (res.ok) {
        setChartResult(data);
        if (data.coaches.length > 0) setSelectedCoach(data.coaches[0]);
        showToast("Vacancy Chart Loaded", "success");
      } else {
        showToast(data.detail || "Train not found", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching chart data", "error");
    } finally {
      setChartLoading(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="hero-container">
        <div className="hero-image-wrapper">
          <div className="hero-content">
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="hero-subtitle">Safety | Security | Punctuality</motion.p>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hero-title">welcome to indian railways</motion.h1>
          </div>
        </div>

        <motion.div id="widget-container" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="widget-container">
          <div className="search-widget">
            <div className="widget-tabs">
              <button className={`tab ${activeTab === 'book' ? 'active' : ''}`} onClick={() => setActiveTab('book')}>
                <Train size={18} /> Train
              </button>
              <button className={`tab ${activeTab === 'pnr' ? 'active' : ''}`} onClick={() => setActiveTab('pnr')}>
                <Search size={18} /> PNR Status
              </button>
              <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
                <Calendar size={18} /> Vacancy Charts
              </button>
            </div>
            {activeTab === 'book' ? (
              <div className="search-form-container">
                <div className="search-form">
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label htmlFor="from-station-input">From</label>
                    <MapPin size={18} style={{ position: 'absolute', left: '16px', bottom: '16px', color: 'var(--primary)' }} />
                    <input 
                      id="from-station-input"
                      type="text" 
                      placeholder="Select from location" 
                      value={fromStn}
                      onChange={(e) => {
                        setFromStn(e.target.value);
                        handleStationSearch(e.target.value, setFromSuggestions);
                      }}
                    />
                    <AnimatePresence>
                      {fromSuggestions.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions">
                          {fromSuggestions.map(s => (
                            <button
                              type="button"
                              key={s.code}
                              className="suggestion-item"
                              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', display: 'block' }}
                              onClick={() => {
                                setFromStn(`${s.code} - ${s.name}`);
                                setFromSuggestions([]);
                              }}
                            >
                              <strong>{s.code}</strong> - {s.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Swap button — own grid column, spacer aligns it with input center */}
                  <div className="swap-col">
                    <motion.button
                      type="button"
                      className="swap-btn"
                      animate={{ rotate: swapRotation }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      onClick={() => {
                        const temp = fromStn;
                        setFromStn(toStn);
                        setToStn(temp);
                        setFromSuggestions([]);
                        setToSuggestions([]);
                        setSwapRotation(r => r + 180);
                      }}
                    >
                      <ArrowLeftRight size={15} className="swap-icon" />
                    </motion.button>
                  </div>

                  <div className="input-group" style={{ position: 'relative' }}>
                    <label htmlFor="to-station-input">To</label>
                    <MapPin size={18} style={{ position: 'absolute', left: '16px', bottom: '16px', color: 'var(--primary)' }} />
                    <input 
                      id="to-station-input"
                      type="text" 
                      placeholder="Select to location" 
                      value={toStn}
                      onChange={(e) => {
                        setToStn(e.target.value);
                        handleStationSearch(e.target.value, setToSuggestions);
                      }}
                    />
                    <AnimatePresence>
                      {toSuggestions.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions">
                          {toSuggestions.map(s => (
                            <button
                              type="button"
                              key={s.code}
                              className="suggestion-item"
                              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: '12px 16px', display: 'block' }}
                              onClick={() => {
                                setToStn(`${s.code} - ${s.name}`);
                                setToSuggestions([]);
                              }}
                            >
                              <strong>{s.code}</strong> - {s.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="input-group">
                    <label htmlFor="date-input">Date</label>
                    <div style={{ position: 'relative' }}>
                      <Calendar size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input id="date-input" type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} style={{ paddingLeft: '44px' }} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="class-select">All Class</label>
                    <select id="class-select" value={classType} onChange={(e) => setClassType(e.target.value)}>
                      <option value="">All Class</option>
                      <option value="1AC">AC First Class (1A)</option>
                      <option value="2AC">AC 2 Tier (2A)</option>
                      <option value="3AC">AC 3 Tier (3A)</option>
                      <option value="Sleeper">Sleeper (SL)</option>
                    </select>
                  </div>

                  <button type="button" className="search-btn" onClick={handleSearch} disabled={loading}>
                    {loading ? <div className="search-spinner" /> : <Search size={22} />}
                  </button>
                </div>
              </div>
            ) : activeTab === 'pnr' ? (
              <div className="pnr-search-container search-form-container">
                <div className="search-row">
                  <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                    <label htmlFor="pnr-input">Enter 10-digit PNR</label>
                    <input 
                      id="pnr-input"
                      type="text" 
                      placeholder="e.g. 1234567890" 
                      value={pnrInput}
                      onChange={(e) => setPnrInput(e.target.value)}
                      style={{ height: '52px', fontSize: '16px' }}
                    />
                  </div>
                  <button 
                    type="button"
                    className="btn btn-primary search-action-btn" 
                    onClick={checkPnrStatus}
                    disabled={pnrLoading}
                  >
                    {pnrLoading ? 'Checking...' : 'Check Status'}
                  </button>
                </div>

                {pnrResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: '24px', padding: '24px', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>PNR Number</h4>
                        <strong style={{ fontSize: '20px', color: '#1e293b' }}>{pnrResult.pnr}</strong>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          borderRadius: '20px', 
                          fontSize: '12px', 
                          fontWeight: 700,
                          background: pnrResult.status === 'CNF' ? '#dcfce7' : (pnrResult.status === 'CANCELLED' || pnrResult.status === 'CANCELLED_SWAPPED') ? '#fee2e2' : '#fef9c3',
                          color: pnrResult.status === 'CNF' ? '#166534' : (pnrResult.status === 'CANCELLED' || pnrResult.status === 'CANCELLED_SWAPPED') ? '#991b1b' : '#854d0e'
                        }}>
                          {pnrResult.status === "CANCELLED_SWAPPED" ? "CANCELLED" : pnrResult.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Train</span>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{pnrResult.train_name} ({pnrResult.train_number})</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Journey Date</span>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{formatDate(pnrResult.travel_date)}</div>
                      </div>
                    </div>

                    <button 
                      type="button"
                      className="btn btn-outline" 
                      style={{ width: '100%', borderColor: '#e2e8f0', color: '#1e293b' }}
                      onClick={() => setViewingTicket(pnrResult)}
                    >
                      View Full Ticket Details
                    </button>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="chart-search-container search-form-container">
                <div className="chart-form-row">
                  <div className="input-group" style={{ flex: 2, minWidth: '200px' }}>
                    <label htmlFor="chart-train-input">Train Number / Name</label>
                    <input 
                      id="chart-train-input"
                      type="text" 
                      placeholder="e.g. 12222 or Duronto" 
                      value={chartTrain}
                      onChange={(e) => setChartTrain(e.target.value)}
                      style={{ height: '52px', fontSize: '16px' }}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label htmlFor="chart-date-input">Journey Date</label>
                    <input 
                      id="chart-date-input"
                      type="date" 
                      value={chartDate}
                      onChange={(e) => setChartDate(e.target.value)}
                      style={{ height: '52px', fontSize: '15px' }}
                    />
                  </div>
                  <button 
                    type="button"
                    className="btn btn-primary search-action-btn" 
                    onClick={getChartStatus}
                    disabled={chartLoading}
                  >
                    {chartLoading ? 'Analyzing...' : 'Get Vacancy Chart'}
                  </button>
                </div>

                {chartResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: '24px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                        {chartResult.train_number} - {chartResult.train} | {formatDate(chartDate)}
                      </h4>
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>
                        {chartResult.coaches.reduce((acc: number, curr: any) => acc + curr.available, 0)} Total Vacant
                      </div>
                    </div>

                    {chartResult && (
                      <div className="coaches-row">
                        {chartResult.coaches.map((c: any) => (
                          <button
                            key={c.coach}
                            type="button"
                            className="coach-chip"
                            style={{
                              borderColor: selectedCoach?.coach === c.coach ? '#22c55e' : '#e2e8f0',
                              background: selectedCoach?.coach === c.coach ? '#f0fdf4' : '#fff',
                              color: selectedCoach?.coach === c.coach ? '#166534' : '#64748b',
                            }}
                            onClick={() => setSelectedCoach(c)}
                          >
                            <div className="c-name">{c.coach}</div>
                            <div className="c-avail">{c.available}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedCoach && (
                      <>
                        {/* Premium Coach Legend */}
                        <div className="seat-map-legend">
                          <div className="legend-item">
                            <span className="legend-dot available"></span>
                            <span className="legend-text">Available</span>
                          </div>
                          <div className="legend-item">
                            <span className="legend-dot occupied"></span>
                            <span className="legend-text">Booked</span>
                          </div>
                        </div>

                        <div className="seat-map-wrapper">
                        <div className="seat-grid">
                          {Array.from({ 
                            length: Math.ceil(selectedCoach.seats.length / 8)
                          }).map((_, bayIdx) => {
                            const baySize = 8;
                            const mainSize = 6;
                            const baySeats = selectedCoach.seats.slice(bayIdx * baySize, bayIdx * baySize + baySize);
                            
                            return (
                              <div key={bayIdx} className="bay">
                                 <div className="bay-label">
                                   Cabin {bayIdx + 1} <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span> Seats {bayIdx * baySize + 1} - {bayIdx * baySize + baySeats.length}
                                 </div>
                                <div className="bay-section">
                                  <div className="main-bay">
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
                    </>
                  )}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </section>



      {/* Popular Routes Section */}
      <section className="popular-routes-section">
        <div className="home-section-header">
          <span className="section-badge">Booking Shortcuts</span>
          <h2>Popular Train Routes</h2>
          <p>Quick booking shortcuts for India's high-demand commercial corridors.</p>
        </div>

        <div className="routes-carousel-container">
          <button className="carousel-nav-btn prev" onClick={() => scrollCarousel("left")} aria-label="Previous routes">
            <ChevronLeft size={24} />
          </button>
          <div className="routes-shortcut-grid" ref={carouselRef}>
            {POPULAR_ROUTES.map((route) => {
              const info = routeInfoMap[route.id] || {
                type: route.fallbackType,
                minFare: route.fallbackFare,
                duration: route.fallbackDuration
              };
              
              let tagClass = "tag-primary";
              const typeLower = info.type.toLowerCase();
              if (typeLower.includes("superfast") || typeLower.includes("sf") || typeLower.includes("mail")) {
                tagClass = "tag-sf";
              } else if (typeLower.includes("duronto") || typeLower.includes("vande")) {
                tagClass = "tag-duronto";
              } else if (typeLower.includes("express")) {
                tagClass = "tag-secondary";
              }

              return (
                <div 
                  key={route.id}
                  className="route-shortcut-card" 
                  style={{ backgroundImage: `url(${route.img})` }} 
                  onClick={() => handleQuickBook(route.fromFull, route.toFull)}
                >
                  <div className="route-header">
                    <span className={`train-tag ${tagClass}`}>{info.type}</span>
                    <span className="route-fare-tag">from ₹{info.minFare}</span>
                  </div>
                  <div className="route-stations-row">
                    <div className="route-stn">
                      <h3>{route.from}</h3>
                      <span>{route.nameFrom}</span>
                    </div>
                    <ArrowLeftRight size={16} className="route-arrow-icon" />
                    <div className="route-stn text-right">
                      <h3>{route.to}</h3>
                      <span>{route.nameTo}</span>
                    </div>
                  </div>
                  <div className="route-footer">
                    <span>Avg: {info.duration}</span>
                    <button className="route-book-btn">Book Route <ArrowRight size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        <button className="carousel-nav-btn next" onClick={() => scrollCarousel("right")} aria-label="Next routes">
          <ChevronRight size={24} />
        </button>
      </div>
    </section>

      {/* How it Works / Travel Timeline */}
      <section className="booking-timeline-section">
        <div className="home-section-header">
          <span className="section-badge">How It Works</span>
          <h2>Reserve Berths in 4 Steps</h2>
          <p>A simple overview of the ticket reservation and digital boarding workflow.</p>
        </div>

        <div className="timeline-stepper">
          <div className="step-block">
            <div className="step-number-ring">1</div>
            <h4>Search Train Routes</h4>
            <p>Input source/destination cities, set travel date, and check train schedules.</p>
          </div>

          <div className="step-block">
            <div className="step-number-ring">2</div>
            <h4>Select Class & Seats</h4>
            <p>View live available seat counts, select booking class (AC/SL), and check confirmation probabilities.</p>
          </div>

          <div className="step-block">
            <div className="step-number-ring">3</div>
            <h4>Verify & Checkout</h4>
            <p>Add passenger details and make payment using Razorpay secure sandbox.</p>
          </div>

          <div className="step-block">
            <div className="step-number-ring">4</div>
            <h4>Board with e-Ticket</h4>
            <p>Get instant PNR status, QR scannable passes via email/PDF, and monitor dynamic swaps.</p>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {showResults && (
        <section id="results-section" className="results-container">
          <div className="results-header">
            <h2>Available Trains</h2>
            <p>{filteredTrains.length} trains found for {fromStn} to {toStn}</p>
          </div>
          
          <div className="train-list">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="skeleton-train-card">
                  <div className="shimmer-row">
                    <div className="shimmer-box shimmer-line-lg" />
                    <div className="shimmer-box shimmer-line-sm" style={{ marginLeft: 'auto' }} />
                  </div>
                  <div className="shimmer-row" style={{ justifyContent: 'center', gap: '32px' }}>
                    <div className="shimmer-box" style={{ width: 60, height: 28 }} />
                    <div className="shimmer-box" style={{ flex: 1, height: 8, borderRadius: 4 }} />
                    <div className="shimmer-box" style={{ width: 60, height: 28 }} />
                  </div>
                  <div className="shimmer-row">
                    {[1,2,3].map(j => <div key={j} className="shimmer-box" style={{ flex: 1, height: 90, borderRadius: 16 }} />)}
                  </div>
                </div>
              ))
            ) : filteredTrains.map((train, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                transition={{ delay: idx * 0.1 }}
                key={train.train_number} 
                className="train-card"
              >
                <div className="train-main-info">
                  <div className="train-name-box">
                    <h3>{train.train_name}</h3>
                    <span className="train-id">#{train.train_number} | {train.type}</span>
                  </div>
                  <div className="route-timeline">
                    <div className="stn-info">
                      <span className="time">{train.departure}</span>
                      <span className="stn-code">{fromStn.split(' - ')[0]}</span>
                    </div>
                    <div className="duration-line">
                      <span className="duration-pill"><Clock size={11} />{train.duration_h}h {train.duration_m}m</span>
                      <div className="line"></div>
                    </div>
                    <div className="stn-info">
                      <span className="time">{train.arrival}</span>
                      <span className="stn-code">{toStn.split(' - ')[0]}</span>
                    </div>
                  </div>
                </div>
                
                <div className="seat-inventory">
                  {Object.entries(train.seat_inventory as Record<string, number>)
                    .filter(([cls]) => !classType || cls === classType)
                    .map(([cls, count]) => {
                      const fare = (train as any).fares?.[cls] || 0;
                      return (
                        <div 
                          key={cls} 
                          className={`seat-box ${count > 0 ? 'available' : 'wl'}`}
                          onClick={() => {
                            setSelectedTrain(train);
                            setSelectedClass(cls);
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                            <span className="class-name">{cls}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}>₹{fare}</span>
                          </div>
                          <span className="seat-count">{count > 0 ? `AVL ${count}` : `WL ${Math.abs(count)}`}</span>
                          <button className="book-mini-btn">
                            Book Now
                          </button>
                        </div>
                      );
                    })}
                </div>
                
                {/* Waitlist Probability Badge */}
                <div className="train-meta-footer" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="prob-container" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="prob-label" style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Confirmation Chance:</span>
                    {Object.entries(train.wl_probabilities || {})
                      .filter(([cls]) => !classType || cls === classType)
                      .map(([cls, prob]) => (
                      <span key={cls} className={`prob-badge ${(prob as string).toLowerCase()}`} style={{ 
                        fontSize: '11px', 
                        fontWeight: '700', 
                        padding: '4px 10px', 
                        borderRadius: '20px',
                        background: (prob as string).toLowerCase() === 'high' ? '#f0fdf4' : (prob as string).toLowerCase() === 'medium' ? '#fffbeb' : '#fef2f2',
                        color: (prob as string).toLowerCase() === 'high' ? '#166534' : (prob as string).toLowerCase() === 'medium' ? '#92400e' : '#991b1b',
                        border: '1px solid currentColor',
                        opacity: 0.8
                      }}>
                        {cls}: {prob as string}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runs On:</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, dIdx) => {
                        const runs = getRunsOnDays(train.train_number)[dIdx];
                        return (
                          <span 
                            key={dIdx} 
                            style={{ 
                              color: runs ? '#1e293b' : '#cbd5e1', 
                              background: runs ? '#f1f5f9' : 'transparent',
                              borderRadius: '4px',
                              width: '18px',
                              height: '18px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px'
                            }}
                          >
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
        </section>
      )}

      {/* Booking Modal */}
      <AnimatePresence>
        {selectedTrain && (
          <div className="modal-overlay" onClick={() => {
            if (bookingSuccess) {
              setSelectedTrain(null);
              setBookingSuccess(null);
              setShowResults(false);
            }
          }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.88, y: 24 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.88, y: 24 }}
              onClick={e => e.stopPropagation()}
              className="booking-modal"
              style={{ 
                background: bookingSuccess ? 'transparent' : 'white', 
                boxShadow: bookingSuccess ? 'none' : '0 20px 40px rgba(0,0,0,0.1)',
                padding: 0,
                maxWidth: bookingSuccess ? '520px' : '600px',
                overflow: bookingSuccess ? 'visible' : 'hidden'
              }}
            >
              {bookingSuccess ? (
                <>
                  <div className="ticket-wrapper">
                    <ETicket 
                      pnr={bookingSuccess.pnr}
                      trainName={selectedTrain?.train_name || ""}
                      trainNumber={selectedTrain?.train_number || ""}
                      departureTime={selectedTrain?.departure || ""}
                      arrivalTime={selectedTrain?.arrival || ""}
                      fromStn={fromStn.split(' - ')[0]}
                      toStn={toStn.split(' - ')[0]}
                      date={date}
                      classType={selectedClass || ""}
                      passengers={bookingSuccess.passengers}
                      status={bookingSuccess.status}
                    />
                  </div>

                  <div style={{ padding: "12px 24px 24px" }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", height: "48px" }}
                      onClick={() => {
                        setSelectedTrain(null);
                        setBookingSuccess(null);
                        setShowPayment(false);
                        setShowResults(false);
                      }}
                    >
                      Back to Home
                    </button>
                  </div>
                </>
              ) : showPayment ? (
                <PaymentModal 
                  user={user}
                  selectedTrain={selectedTrain}
                  selectedClass={selectedClass || ""}
                  passengers={passengers}
                  fromStn={fromStn}
                  toStn={toStn}
                  travelDate={date || new Date().toISOString().split('T')[0]}
                  getToken={getToken}
                  onSuccess={handleBookingSuccess}
                  onCancel={() => setShowPayment(false)}
                  apiUrl={API_URL}
                  razorpayKeyId={import.meta.env.VITE_RAZORPAY_KEY_ID}
                />
              ) : (
                <>
                  <div className="modal-header">
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Passenger Details</h2>
                      <p style={{ fontSize: '12px', color: '#666' }}>{selectedTrain?.train_name}</p>
                    </div>
                    <button className="close-btn" onClick={() => setSelectedTrain(null)}><X /></button>
                  </div>

                  <div className="modal-body" style={{ maxHeight: '55vh', overflowY: 'auto', padding: '20px 24px' }}>
                    {/* Guest Login Warning Alert */}
                    {!user && (
                      <div style={{ 
                        background: '#fffbeb', 
                        border: '1px solid #fef3c7', 
                        borderRadius: '12px', 
                        padding: '12px 16px', 
                        marginBottom: '20px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px' 
                      }}>
                        <AlertCircle size={20} color="#b45309" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                          You are currently searching as a guest. Please sign in to finalize your booking and seats.
                        </span>
                      </div>
                    )}
                    {/* Select Travelling Passengers Grid */}
                    {user && savedPassengers.length > 0 && (
                      <div className="saved-passengers-selection" style={{ marginBottom: '24px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '12px', letterSpacing: '0.5px' }}>
                          Select Travelling Passengers
                        </label>
                        <div className="passenger-select-grid">
                          {savedPassengers.map((sp) => {
                            const isSelected = passengers.some(p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase() && !p.isCustom);
                            return (
                              <div 
                                key={sp.name} 
                                className={`passenger-select-card ${isSelected ? 'active' : ''}`}
                                onClick={() => toggleSavedPassenger(sp)}
                              >
                                <div className="card-checkbox-wrapper">
                                  <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && <span className="checkmark">✓</span>}
                                  </div>
                                </div>
                                <div className="card-info">
                                  <div className="card-name">{sp.name}</div>
                                  <div className="card-meta">{sp.age} Yrs • {sp.gender}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom / New Passengers Section */}
                    <div className="passenger-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {user && savedPassengers.length > 0 && (
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginTop: '4px', marginBottom: '4px', letterSpacing: '0.5px' }}>
                          Additional / New Passengers
                        </label>
                      )}

                      {passengers.map((p, i) => {
                        // Render standard inputs for:
                        // 1. All passengers if no saved profiles exist
                        // 2. Only passengers marked as isCustom if saved profiles exist
                        const shouldRenderInput = !user || savedPassengers.length === 0 || p.isCustom;
                        if (!shouldRenderInput) return null;

                        const isSaved = savedPassengers.some(sp => sp.name.trim().toLowerCase() === p.name.trim().toLowerCase());
                        
                        return (
                          <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={i} 
                            className="passenger-row"
                            style={{ background: '#f9fafb', padding: '16px', borderRadius: '12px', position: 'relative', border: '1px solid #eee' }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 1fr auto', gap: '12px' }}>
                              <div className="input-group">
                                <label style={{ fontSize: '10px' }}>Name</label>
                                <input type="text" value={p.name} onChange={(e) => {
                                  const newP = [...passengers];
                                  newP[i].name = e.target.value;
                                  setPassengers(newP);
                                }} style={{ background: 'white', padding: '10px 12px' }} />
                              </div>
                              <div className="input-group">
                                <label style={{ fontSize: '10px' }}>Age</label>
                                <input type="number" value={p.age} onChange={(e) => {
                                  const newP = [...passengers];
                                  newP[i].age = e.target.value;
                                  setPassengers(newP);
                                }} style={{ background: 'white', padding: '10px 12px' }} />
                              </div>
                              <div className="input-group">
                                <label style={{ fontSize: '10px' }}>Gender</label>
                                <select value={p.gender} onChange={(e) => {
                                  const newP = [...passengers];
                                  newP[i].gender = e.target.value;
                                  setPassengers(newP);
                                }} style={{ background: 'white', padding: '10px', borderRadius: '10px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                                  <option>Male</option>
                                  <option>Female</option>
                                  <option>Other</option>
                                </select>
                              </div>
                              
                              <div className="passenger-row-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '16px' }}>
                                {user && p.name.trim() && (
                                  <button
                                    className="action-icon-btn star-btn"
                                    onClick={() => toggleSaveToProfile(p, i)}
                                    disabled={savingPassengerIndex === i}
                                    title={isSaved ? "Remove from Saved" : "Save to Profile"}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '6px',
                                      borderRadius: '50%',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: isSaved ? '#eab308' : '#94a3b8',
                                      transition: 'all 0.2s ease',
                                    }}
                                  >
                                    <Star 
                                      size={18} 
                                      fill={isSaved ? '#eab308' : 'none'} 
                                      className={savingPassengerIndex === i ? 'pulse' : ''}
                                    />
                                  </button>
                                )}
                                
                                <button
                                  className="action-icon-btn trash-btn"
                                  onClick={() => {
                                    setPassengers(prev => prev.filter((_, idx) => idx !== i));
                                  }}
                                  title="Remove Passenger"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '6px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#ef4444',
                                    transition: 'all 0.2s ease',
                                  }}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    
                    <button 
                      className="add-btn" 
                      onClick={() => setPassengers([...passengers, { name: "", age: "", gender: "Male", isCustom: true }])} 
                      style={{ marginTop: '12px', background: 'none', border: '1px dashed #ccc', width: '100%', padding: '10px', borderRadius: '10px', fontSize: '13px', color: '#666', fontWeight: 600, cursor: 'pointer' }}
                    >
                      + Add New Passenger
                    </button>
                  </div>

                  <div className="modal-footer" style={{ borderTop: '1px solid #eee', padding: '20px 24px', background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E6F2B' }}>
                        ₹{selectedClass ? ((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length : 0}
                      </div>
                      <button 
                        className="btn btn-primary" 
                        onClick={handleBook} 
                        style={{ 
                          height: '44px', 
                          padding: '0 32px',
                          background: !user ? 'linear-gradient(135deg, #1E6F2B 0%, #2d8a3f 100%)' : undefined
                        }}
                      >
                        {user ? 'Proceed to Pay' : 'Login to Book'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Viewing Ticket Modal (e.g. from PNR search) */}
      <AnimatePresence>
        {viewingTicket && (
          <div className="modal-overlay" onClick={() => setViewingTicket(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.88, y: 24 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.88, y: 24 }}
              onClick={e => e.stopPropagation()}
              className="booking-modal"
              style={{ background: 'transparent', padding: 0, maxWidth: '520px', boxShadow: 'none' }}
            >
              <div className="ticket-wrapper">
                <ETicket 
                  pnr={viewingTicket.pnr}
                  trainName={viewingTicket.train_name}
                  trainNumber={viewingTicket.train_number}
                  departureTime={viewingTicket.departure}
                  arrivalTime={viewingTicket.arrival}
                  fromStn={viewingTicket.from_stn}
                  toStn={viewingTicket.to_stn}
                  date={viewingTicket.travel_date}
                  classType={viewingTicket.class_type}
                  passengers={viewingTicket.passengers || []}
                  status={viewingTicket.status}
                />
              </div>
              <div style={{ padding: "16px 20px" }}>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", height: "48px" }}
                  onClick={() => setViewingTicket(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Live Telemetry Modal */}
      <AnimatePresence>
        {showTelemetryModal && (
          <div className="modal-overlay" onClick={() => setShowTelemetryModal(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="telemetry-dialog-card"
            >
              <div className="telemetry-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Activity size={22} className="pulse-icon" style={{ color: 'var(--primary)' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Platform Live Telemetry</h3>
                </div>
                <button className="telemetry-close-btn" onClick={() => setShowTelemetryModal(false)}><X size={18} /></button>
              </div>
              <div className="telemetry-modal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', color: '#166534', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, marginBottom: '20px' }}>
                  <span className="live-status-dot"></span>
                  Distributed Reservation Core: ONLINE
                </div>
                
                <div className="telemetry-grid">
                  <div className="telemetry-metric-item">
                    <span className="metric-label">Active Train Routings</span>
                    <span className="metric-value">120 Trains</span>
                    <span className="metric-desc">Continuous MQTT schedule synchronization</span>
                  </div>
                  <div className="telemetry-metric-item">
                    <span className="metric-label">IPC Allocation Latency</span>
                    <span className="metric-value">1.6 ms</span>
                    <span className="metric-desc">Numpy-backed atomic memory lock buffers</span>
                  </div>
                  <div className="telemetry-metric-item">
                    <span className="metric-label">Auto-Cleared Waitlists</span>
                    <span className="metric-value">1,248 Seats</span>
                    <span className="metric-desc">Waitlists upgraded instantly on cancellation</span>
                  </div>
                  <div className="telemetry-metric-item">
                    <span className="metric-label">Upstash Cache Hit Rate</span>
                    <span className="metric-value">94.2%</span>
                    <span className="metric-desc">Redis caching active for static queries</span>
                  </div>
                </div>

                <div className="telemetry-info-box">
                  <Info size={14} className="info-icon" />
                  <p>All metrics are simulated in real time using distributed system event loops (Motor MongoDB drivers + Celery background workers + EMQX brokers).</p>
                </div>
              </div>
              <div className="telemetry-modal-footer">
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowTelemetryModal(false)}>Close Diagnostics</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Home;
