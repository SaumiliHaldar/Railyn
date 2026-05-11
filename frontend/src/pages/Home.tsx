import { useAuth, useUser } from "@clerk/clerk-react";
import { Search, MapPin, Calendar, Train, Clock, X, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
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
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [showPayment, setShowPayment] = useState(false);

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
    setBookingLoading(true);
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
      setBookingLoading(false);
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="hero-container" style={{ height: showResults ? '80vh' : '100vh', transition: 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}>
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
              {!bookingSuccess ? (
                <>
                  <div className="modal-header">
                    <div>
                      <h2>Confirm Booking</h2>
                      <p>{selectedTrain.train_name} (#{selectedTrain.train_number}) · {selectedClass}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#aaa', textTransform: 'uppercase' }}>Total Fare</span>
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#1E6F2B' }}>
                        ₹{((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length}
                      </span>
                    </div>
                    <button className="close-btn" onClick={() => setSelectedTrain(null)}><X /></button>
                  </div>

                  <div className="modal-body">
                    <div className="passenger-list">
                      {passengers.map((p, i) => (
                        <div key={i} className="passenger-row">
                          <div className="input-group">
                            <label>Name</label>
                            <input type="text" placeholder="Full Name" value={p.name} onChange={(e) => {
                              const newP = [...passengers];
                              newP[i].name = e.target.value;
                              setPassengers(newP);
                            }} />
                          </div>
                          <div className="input-group" style={{ width: '80px' }}>
                            <label>Age</label>
                            <input type="number" placeholder="Age" value={p.age} onChange={(e) => {
                              const newP = [...passengers];
                              newP[i].age = e.target.value;
                              setPassengers(newP);
                            }} />
                          </div>
                          <div className="input-group">
                            <label>Gender</label>
                            <select value={p.gender} onChange={(e) => {
                              const newP = [...passengers];
                              newP[i].gender = e.target.value;
                              setPassengers(newP);
                            }}>
                              <option>Male</option>
                              <option>Female</option>
                              <option>Other</option>
                            </select>
                          </div>
                          {passengers.length > 1 && (
                            <button className="remove-btn" onClick={() => setPassengers(passengers.filter((_, idx) => idx !== i))}>
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button className="add-btn" onClick={() => setPassengers([...passengers, { name: "", age: "", gender: "Male" }])}>
                      <Plus size={16} /> Add Passenger
                    </button>
                  </div>

                  <div className="modal-footer">
                    <button className="btn btn-outline" onClick={() => setSelectedTrain(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleBook} disabled={bookingLoading}>
                      {bookingLoading ? "Processing..." : "Confirm & Book"}
                    </button>
                  </div>
                </>
              ) : showPayment ? (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1a1a1a', marginBottom: '8px' }}>Railyn Pay</h2>
                    <p style={{ fontSize: '14px', color: '#666' }}>Scan QR or click 'Complete' to simulate payment</p>
                  </div>

                  <div className="upi-qr-box" style={{ 
                    width: '220px', 
                    height: '220px', 
                    margin: '0 auto 32px', 
                    background: '#fff', 
                    padding: '16px', 
                    borderRadius: '24px',
                    border: '1px solid #eee',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ width: '150px', height: '150px', background: '#f5f5f5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#999', fontWeight: 700, textAlign: 'center' }}>DEMO QR<br/>FOR PORTFOLIO</span>
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '12px', fontWeight: 800, color: '#1E6F2B' }}>UPI ID: railyn@demo</div>
                  </div>

                  <div style={{ background: '#f8f9f8', padding: '20px', borderRadius: '16px', marginBottom: '24px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', color: '#666' }}>Payable Amount</span>
                      <strong style={{ fontSize: '18px', color: '#1E6F2B' }}>₹{((selectedTrain as any).fares?.[selectedClass] || 0) * passengers.length}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', fontWeight: 600 }}>TRANSACTION ID: RLN-{Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowPayment(false)}>Back</button>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 2 }} 
                      onClick={executeBooking}
                      disabled={bookingLoading}
                    >
                      {bookingLoading ? 'Processing...' : 'Complete Payment'}
                    </button>
                  </div>
                </div>
              ) : (
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

                  <div style={{ padding: "16px 20px" }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => {
                        setSelectedTrain(null);
                        setBookingSuccess(null);
                        setShowResults(false);
                      }}
                    >
                      Back to Home
                    </button>
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
