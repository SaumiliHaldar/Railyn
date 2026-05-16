import { useAuth, useUser } from "@clerk/clerk-react";
import { Search, MapPin, Calendar, Train, Clock, X } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Ticket from "../components/Ticket";
import PaymentModal from "../components/PaymentModal";
import { formatDate } from "../utils/dateUtils";
import { useToast } from "../components/ui/toast-1";

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
}

const Home = () => {
  const [activeTab, setActiveTab] = useState("book");
  const { getToken } = useAuth();
  const { user } = useUser();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [fromStn, setFromStn] = useState("");
  const [toStn, setToStn] = useState("");
  const [date, setDate] = useState("");
  const [classType, setClassType] = useState("");
  const [quota, setQuota] = useState("General");
  
  const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Station[]>([]);
  const [trains, setTrains] = useState<TrainData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([{ name: "", age: "", gender: "Male" }]);
  const [bookingSuccess, setBookingSuccess] = useState<BookingData | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [pnrInput, setPnrInput] = useState("");
  const [pnrResult, setPnrResult] = useState<BookingData | null>(null);
  const [pnrLoading, setPnrLoading] = useState(false);
  const [chartTrain, setChartTrain] = useState("");
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<any | null>(null);
  const [chartDate, setChartDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewingTicket, setViewingTicket] = useState<BookingData | null>(null);

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
    if (f) setFromStn(f);
    if (t) setToStn(t);
    if (d) setDate(d);
    
    // Load Razorpay Script
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    
  }, [user]);

  const handleStationSearch = async (query: string, setSuggestions: React.Dispatch<React.SetStateAction<Station[]>>) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const res = await fetch(`${API_URL}/stn_search?q=${query}`);
    const data = await res.json();
    setSuggestions(data.results || []);
  };

  const handleSearch = async () => {
    if (!fromStn || !toStn) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/trn_search?from_stn=${fromStn.split(' - ')[0]}&to_stn=${toStn.split(' - ')[0]}`);
      const data = await res.json();
      setTrains(data.results || []);
      setShowResults(true);
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!user) return showToast("Please login to book tickets", "warning");
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/pnr_status/${pnrInput}`);
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

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="widget-container">
          <div className="search-widget">
            <div className="widget-tabs">
              <button className={`tab ${activeTab === 'book' ? 'active' : ''}`} onClick={() => setActiveTab('book')}>
                <Train size={18} /> Train
              </button>
              <button className={`tab ${activeTab === 'pnr' ? 'active' : ''}`} onClick={() => setActiveTab('pnr')}>
                <Search size={18} /> PNR Status
              </button>
              <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
                <Calendar size={18} /> Live Train Status
              </button>
            </div>
            {activeTab === 'book' ? (
              <div className="search-form-container">
                <div className="search-form">
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label>From</label>
                    <MapPin size={18} style={{ position: 'absolute', left: '16px', bottom: '16px', color: 'var(--primary)' }} />
                    <input 
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
                            <div key={s.code} className="suggestion-item" onClick={() => {
                              setFromStn(`${s.code} - ${s.name}`);
                              setFromSuggestions([]);
                            }}>
                              <strong>{s.code}</strong> - {s.name}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label>To</label>
                    <MapPin size={18} style={{ position: 'absolute', left: '16px', bottom: '16px', color: 'var(--primary)' }} />
                    <input 
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
                            <div key={s.code} className="suggestion-item" onClick={() => {
                              setToStn(`${s.code} - ${s.name}`);
                              setToSuggestions([]);
                            }}>
                              <strong>{s.code}</strong> - {s.name}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="input-group">
                    <label>Date</label>
                    <div style={{ position: 'relative' }}>
                      <Calendar size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ paddingLeft: '44px' }} />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>All Class</label>
                    <select value={classType} onChange={(e) => setClassType(e.target.value)}>
                      <option value="">Class</option>
                      <option value="1AC">AC First Class (1A)</option>
                      <option value="2AC">AC 2 Tier (2A)</option>
                      <option value="3AC">AC 3 Tier (3A)</option>
                      <option value="Sleeper">Sleeper (SL)</option>
                    </select>
                  </div>

                  <button className="search-btn" onClick={handleSearch} disabled={loading}>
                    {loading ? "..." : <Search size={22} />}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '20px', marginTop: '20px', paddingLeft: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select value={quota} onChange={(e) => setQuota(e.target.value)} style={{ border: 'none', background: 'none', fontWeight: '700', fontSize: '14px', color: '#64748b', cursor: 'pointer', padding: '0' }}>
                      <option>General</option>
                      <option>Ladies</option>
                      <option>Tatkal</option>
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 'auto' }} /> Divyaang Concession
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 'auto' }} /> Railway Pass Concession
                  </label>
                </div>
              </div>
            ) : activeTab === 'pnr' ? (
              <div className="pnr-search-container" style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                    <label>Enter 10-digit PNR</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 1234567890" 
                      value={pnrInput}
                      onChange={(e) => setPnrInput(e.target.value)}
                      style={{ height: '52px', fontSize: '16px' }}
                    />
                  </div>
                  <button 
                    className="btn btn-primary" 
                    onClick={checkPnrStatus}
                    disabled={pnrLoading}
                    style={{ height: '52px', alignSelf: 'flex-end', padding: '0 32px' }}
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
                          background: pnrResult.status === 'CNF' ? '#dcfce7' : '#fef9c3',
                          color: pnrResult.status === 'CNF' ? '#166534' : '#854d0e'
                        }}>
                          {pnrResult.status}
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
              <div className="chart-search-container" style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div className="input-group" style={{ flex: 2, minWidth: '200px' }}>
                    <label>Train Number / Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 12222 or Duronto" 
                      value={chartTrain}
                      onChange={(e) => setChartTrain(e.target.value)}
                      style={{ height: '52px', fontSize: '16px' }}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label>Journey Date</label>
                    <input 
                      type="date" 
                      value={chartDate}
                      onChange={(e) => setChartDate(e.target.value)}
                      style={{ height: '52px', fontSize: '15px' }}
                    />
                  </div>
                  <button 
                    className="btn btn-primary" 
                    onClick={getChartStatus}
                    disabled={chartLoading}
                    style={{ height: '52px', alignSelf: 'flex-end', padding: '0 32px' }}
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
                      <div className="seat-map-wrapper">
                        <div className="seat-grid">
                          {Array.from({ 
                            length: Math.ceil(selectedCoach.seats.length / (selectedCoach.class_name === '2AC' ? 6 : 8))
                          }).map((_, bayIdx) => {
                            const baySize = selectedCoach.class_name === '2AC' ? 6 : 8;
                            const mainSize = selectedCoach.class_name === '2AC' ? 4 : 6;
                            const baySeats = selectedCoach.seats.slice(bayIdx * baySize, bayIdx * baySize + baySize);
                            
                            return (
                              <div key={bayIdx} className="bay">
                                <div className="bay-label">Bay {bayIdx + 1}</div>
                                <div className={`bay-section ${selectedCoach.class_name === '2AC' ? 'ac2' : ''}`}>
                                  <div className={`main-bay ${selectedCoach.class_name === '2AC' ? 'ac2' : ''}`}>
                                    {baySeats.slice(0, mainSize).map((s: any) => (
                                      <div 
                                        key={s.number} 
                                        className={`seat-box ${s.is_occupied ? 'occupied' : 'available'}`}
                                        title={`${s.berth_type} - ${s.is_occupied ? 'Occupied' : 'Vacant'}`}
                                      >
                                        <span className="s-num">{s.number}</span>
                                        <span className="s-type">{s.berth_type}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="side-bay">
                                    {baySeats.slice(mainSize).map((s: any) => (
                                      <div 
                                        key={s.number} 
                                        className={`seat-box ${s.is_occupied ? 'occupied' : 'available'}`}
                                        title={`${s.berth_type} - ${s.is_occupied ? 'Occupied' : 'Vacant'}`}
                                      >
                                        <span className="s-num">{s.number}</span>
                                        <span className="s-type">{s.berth_type}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* Results Section */}
      {showResults && (
        <section id="results-section" className="results-container">
          <div className="results-header">
            <h2>Available Trains</h2>
            <p>{trains.length} trains found for {fromStn} to {toStn}</p>
          </div>
          
          <div className="train-list">
            {trains.map((train, idx) => (
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
                      <Clock size={14} />
                      <span>{train.duration_h}h {train.duration_m}m</span>
                      <div className="line"></div>
                    </div>
                    <div className="stn-info">
                      <span className="time">{train.arrival}</span>
                      <span className="stn-code">{toStn.split(' - ')[0]}</span>
                    </div>
                  </div>
                </div>
                
                <div className="seat-inventory">
                  {Object.entries(train.seat_inventory as Record<string, number>).map(([cls, count]) => {
                    const fare = (train as any).fares?.[cls] || 0;
                    return (
                      <div key={cls} className={`seat-box ${count > 0 ? 'available' : 'wl'}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                          <span className="class-name">{cls}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E6F2B' }}>₹{fare}</span>
                        </div>
                        <span className="seat-count">{count > 0 ? `AVL ${count}` : `WL ${Math.abs(count)}`}</span>
                        <button 
                          className="book-mini-btn"
                          onClick={() => {
                            setSelectedTrain(train);
                            setSelectedClass(cls);
                          }}
                        >
                          Book Now
                        </button>
                      </div>
                    );
                  })}
                </div>
                
                {/* Waitlist Probability Badge */}
                <div className="train-meta-footer">
                  <div className="prob-container">
                    <span className="prob-label">Confirmation Probability:</span>
                    {Object.entries(train.wl_probabilities || {}).map(([cls, prob]) => (
                      <span key={cls} className={`prob-badge ${(prob as string).toLowerCase()}`}>
                        {cls}: {prob as string}
                      </span>
                    ))}
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
                    <Ticket 
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

                  <div className="modal-body" style={{ maxHeight: '45vh', overflowY: 'auto', padding: '20px 24px' }}>
                    <div className="passenger-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {passengers.map((p, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={i} 
                          className="passenger-row"
                          style={{ background: '#f9fafb', padding: '16px', borderRadius: '12px', position: 'relative', border: '1px solid #eee' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.6fr 1fr', gap: '12px' }}>
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
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <button className="add-btn" onClick={() => setPassengers([...passengers, { name: "", age: "", gender: "Male" }])} style={{ marginTop: '12px', background: 'none', border: '1px dashed #ccc', width: '100%', padding: '10px', borderRadius: '10px', fontSize: '13px', color: '#666', fontWeight: 600, cursor: 'pointer' }}>
                      + Add Passenger
                    </button>
                  </div>

                  <div className="modal-footer" style={{ borderTop: '1px solid #eee', padding: '20px 24px', background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E6F2B' }}>
                        ₹{selectedClass ? ((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length : 0}
                      </div>
                      <button className="btn btn-primary" onClick={handleBook} style={{ height: '44px', padding: '0 32px' }}>
                        Proceed to Pay
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
                <Ticket 
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
    </>
  );
};

export default Home;
