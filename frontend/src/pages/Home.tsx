import { useAuth, useUser } from "@clerk/clerk-react";
import { Search, MapPin, Calendar, Train, Clock, X } from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Ticket from "../components/Ticket";

const API_URL = import.meta.env.VITE_API_URL;

const Home = () => {
  const [activeTab, setActiveTab] = useState("book");
  const { getToken } = useAuth();
  const { user } = useUser();
  
  const [fromStn, setFromStn] = useState("");
  const [toStn, setToStn] = useState("");
  const [date, setDate] = useState("");
  const [classType, setClassType] = useState("");
  const [quota, setQuota] = useState("General");
  
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [trains, setTrains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [passengers, setPassengers] = useState([{ name: "", age: "", gender: "Male" }]);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pnrInput, setPnrInput] = useState("");
  const [pnrResult, setPnrResult] = useState(null);
  const [pnrLoading, setPnrLoading] = useState(false);
  const [chartTrain, setChartTrain] = useState("");
  const [chartResult, setChartResult] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState(null);

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
  }, [user]);

  const handleStationSearch = async (query, setSuggestions) => {
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
    if (!user) return alert("Please login to book tickets");
    if (passengers.some(p => !p.name || !p.age)) {
      alert("Please fill all passenger details");
      return;
    }
    setShowPayment(true);
  };

  const executeBooking = async () => {
    setIsProcessing(true);
    
    // Simulate interactive payment verification delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const token = await getToken();
      const totalFare = (selectedTrain.fares[selectedClass] || 0) * passengers.length;
      const res = await fetch(`${API_URL}/book_tkt`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          train_number: selectedTrain.train_number,
          train_name: selectedTrain.train_name,
          from_stn: fromStn.split(' - ')[0],
          to_stn: toStn.split(' - ')[0],
          departure: selectedTrain.departure,
          arrival: selectedTrain.arrival,
          travel_date: date || new Date().toISOString().split('T')[0],
          class_type: selectedClass,
          passengers: passengers.map(p => ({
            name: p.name,
            age: parseInt(p.age),
            gender: p.gender
          })),
          user_name: user?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown',
          user_email: user?.primaryEmailAddress?.emailAddress || 'Unknown',
          total_fare: totalFare
        })
      });
      const data = await res.json();
      setBookingSuccess(data);

      // Local UI update: Decrement the seat count by number of passengers
      if (data.status === "CNF") {
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
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const checkPnrStatus = async () => {
    if (!pnrInput) return;
    setPnrLoading(true);
    setPnrResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/pnr_status/${pnrInput}`);
      const data = await res.json();
      if (res.ok) setPnrResult(data.booking);
      else alert(data.detail || "PNR not found");
    } catch (err) {
      console.error(err);
      alert("Error fetching PNR status");
    } finally {
      setPnrLoading(false);
    }
  };

  const getChartStatus = async () => {
    if (!chartTrain) return;
    setChartLoading(true);
    setChartResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/train_chart/${chartTrain}`);
      const data = await res.json();
      if (res.ok) {
        setChartResult(data);
        if (data.coaches.length > 0) setSelectedCoach(data.coaches[0]);
      } else {
        alert(data.detail || "Train not found");
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching chart data");
    } finally {
      setChartLoading(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="hero-container">
        <div className="hero-content">
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="hero-subtitle">Safety | Security | Punctuality</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hero-title">Indian Railways</motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="hero-description">
            Heartily enjoy every journey through our boundless hospitality. 
            Through Indian railways, The Lifeline of the Nation.
          </motion.p>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="widget-container">
          <div className="widget-tabs">
            <button className={`tab ${activeTab === 'book' ? 'active' : ''}`} onClick={() => setActiveTab('book')}>
              <Train size={18} /> Book Ticket
            </button>
            <button className={`tab ${activeTab === 'pnr' ? 'active' : ''}`} onClick={() => setActiveTab('pnr')}>
              <Search size={18} /> PNR Status
            </button>
            <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
              <Calendar size={18} /> Charts/Vacancy
            </button>
          </div>

          <div className="search-widget">
            {activeTab === 'book' ? (
              <>
                <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#888', textTransform: 'uppercase' }}>Quota</span>
                    <select value={quota} onChange={(e) => setQuota(e.target.value)} style={{ border: 'none', background: 'none', fontWeight: '700', fontSize: '15px', cursor: 'pointer', padding: '0' }}>
                      <option>General</option>
                      <option>Ladies</option>
                      <option>Lower Berth / Sr. Citizen</option>
                      <option>Tatkal</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#888', textTransform: 'uppercase' }}>Class</span>
                    <select value={classType} onChange={(e) => setClassType(e.target.value)} style={{ border: 'none', background: 'none', fontWeight: '700', fontSize: '15px', cursor: 'pointer', padding: '0' }}>
                      <option value="">All Class</option>
                      <option value="1AC">AC First Class (1A)</option>
                      <option value="2AC">AC 2 Tier (2A)</option>
                      <option value="3AC">AC 3 Tier (3A)</option>
                      <option value="Sleeper">Sleeper (SL)</option>
                    </select>
                  </div>
                </div>

                <div className="search-form">
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label>From</label>
                    <MapPin size={16} style={{ position: 'absolute', left: '12px', bottom: '18px', color: '#666' }} />
                    <input 
                      type="text" 
                      placeholder="Enter station" 
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
                    <MapPin size={16} style={{ position: 'absolute', left: '12px', bottom: '18px', color: '#666' }} />
                    <input 
                      type="text" 
                      placeholder="Enter station" 
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
                    <label>Journey Date</label>
                    <div style={{ position: 'relative' }}>
                      <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ paddingLeft: '44px' }} />
                    </div>
                  </div>

                  <button className="search-btn" onClick={handleSearch} disabled={loading}>
                    {loading ? "Searching..." : <><Search size={20} /> Search Train</>}
                  </button>
                </div>
              </>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Train</span>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{pnrResult.train_name} ({pnrResult.train_number})</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Journey Date</span>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{pnrResult.travel_date}</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="chart-search-container" style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                    <label>Train Number / Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 12222 or Duronto" 
                      value={chartTrain}
                      onChange={(e) => setChartTrain(e.target.value)}
                      style={{ height: '52px', fontSize: '16px' }}
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
                        {chartResult.train_number} - {chartResult.train}
                      </h4>
                      <div style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                        {chartResult.coaches.reduce((acc, curr) => acc + curr.available, 0)} Total Vacant
                      </div>
                    </div>

                    {/* Coach Selector */}
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '24px', paddingBottom: '8px' }}>
                      {chartResult.coaches.map((c, i) => (
                        <button 
                          key={i}
                          onClick={() => setSelectedCoach(c)}
                          style={{ 
                            padding: '10px 16px', 
                            borderRadius: '12px', 
                            border: '1px solid',
                            borderColor: selectedCoach?.coach === c.coach ? '#22c55e' : '#e2e8f0',
                            background: selectedCoach?.coach === c.coach ? '#f0fdf4' : '#fff',
                            color: selectedCoach?.coach === c.coach ? '#166534' : '#64748b',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {c.coach}
                          <div style={{ fontSize: '10px', opacity: 0.8 }}>{c.available} Vacant</div>
                        </button>
                      ))}
                    </div>

                    {/* Realistic Seat Map */}
                    {selectedCoach && (
                      <div className="realistic-coach-map" style={{ 
                        background: '#f8fafc', 
                        padding: '24px', 
                        borderRadius: '20px', 
                        border: '2px solid #e2e8f0',
                        maxHeight: '400px',
                        overflowY: 'auto'
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                          {/* We'll render seats in compartments of 8 */}
                          {Array.from({ length: Math.ceil(selectedCoach.seats.length / 8) }).map((_, compartmentIdx) => (
                            <React.Fragment key={compartmentIdx}>
                              <div style={{ gridColumn: 'span 4', height: '1px', background: '#e2e8f0', margin: '8px 0' }} />
                              
                              {/* Left Side (6 seats) */}
                              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                {selectedCoach.seats.slice(compartmentIdx * 8, compartmentIdx * 8 + 6).map(s => (
                                  <div key={s.num} style={{ 
                                    padding: '8px 4px', 
                                    borderRadius: '6px', 
                                    background: s.is_occupied ? '#fee2e2' : '#dcfce7',
                                    border: '1px solid',
                                    borderColor: s.is_occupied ? '#fecaca' : '#bbf7d0',
                                    textAlign: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: s.is_occupied ? '#991b1b' : '#166534'
                                  }}>
                                    {s.num}
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>{s.type}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Aisle Spacer */}
                              <div style={{ width: '20px' }} />

                              {/* Right Side (2 side berths) */}
                              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '8px' }}>
                                {selectedCoach.seats.slice(compartmentIdx * 8 + 6, compartmentIdx * 8 + 8).map(s => (
                                  <div key={s.num} style={{ 
                                    padding: '8px 4px', 
                                    borderRadius: '6px', 
                                    background: s.is_occupied ? '#fee2e2' : '#dcfce7',
                                    border: '1px solid',
                                    borderColor: s.is_occupied ? '#fecaca' : '#bbf7d0',
                                    textAlign: 'center',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: s.is_occupied ? '#991b1b' : '#166534'
                                  }}>
                                    {s.num}
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>{s.type}</div>
                                  </div>
                                ))}
                              </div>
                            </React.Fragment>
                          ))}
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
                      trainName={selectedTrain.train_name}
                      trainNumber={selectedTrain.train_number}
                      departureTime={selectedTrain.departure}
                      arrivalTime={selectedTrain.arrival}
                      fromStn={fromStn.split(' - ')[0]}
                      toStn={toStn.split(' - ')[0]}
                      date={date}
                      classType={selectedClass}
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
              ) : isProcessing ? (
                <div className="processing-container">
                  <div className="loader-ring"></div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Verifying Payment</h3>
                  <p style={{ fontSize: '14px', color: '#666' }}>Communicating with secure bank gateway...</p>
                </div>
              ) : showPayment ? (
                <div style={{ padding: '32px 24px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Secure Payment</h2>
                    <p style={{ fontSize: '13px', color: '#666' }}>UPI & Card Simulation Enabled</p>
                  </div>

                  <div className="upi-qr-box" style={{ 
                    width: '160px', 
                    height: '160px', 
                    margin: '0 auto 24px', 
                    background: '#fff', 
                    padding: '12px', 
                    borderRadius: '20px',
                    border: '1px solid #eee',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ width: '120px', height: '120px', background: '#f8f9fa', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ddd' }}>
                      <span style={{ fontSize: '8px', color: '#999', fontWeight: 800, textAlign: 'center' }}>DEMO<br/>GATEWAY</span>
                    </div>
                  </div>

                  <div style={{ background: '#f8faf8', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #edf2ed' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#666' }}>Class: <strong>{selectedClass}</strong></span>
                      <span style={{ fontSize: '13px', color: '#666' }}>Pax: <strong>{passengers.length}</strong></span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700 }}>Total Payable</span>
                      <strong style={{ fontSize: '18px', color: '#1E6F2B' }}>₹{((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-outline" style={{ flex: 1, height: '48px' }} onClick={() => setShowPayment(false)}>Back</button>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 2, height: '48px' }} 
                      onClick={executeBooking}
                    >
                      Verify & Pay
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="modal-header">
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Passenger Details</h2>
                      <p style={{ fontSize: '12px', color: '#666' }}>{selectedTrain.train_name}</p>
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
                        ₹{((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length}
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
    </>
  );
};

export default Home;
