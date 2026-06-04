import { useAuth, useUser } from "@clerk/clerk-react";
import { 
  Search, MapPin, Calendar, Train, X, 
  ArrowLeftRight, Activity, 
  Info, ArrowRight,
  ChevronLeft, ChevronRight
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
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

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const localMaxDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 60); // 2 months (60 days) limit
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
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [fromStn, setFromStn] = useState("");
  const [toStn, setToStn] = useState("");
  const [date, setDate] = useState(localToday());
  const [classType, setClassType] = useState("");
  
  const [fromSuggestions, setFromSuggestions] = useState<Station[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Station[]>([]);
  const [pnrInput, setPnrInput] = useState("");
  const [chartTrain, setChartTrain] = useState("");
  const [swapRotation, setSwapRotation] = useState(0);
  const [chartDate, setChartDate] = useState(localToday());
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
              const data = await res.json();
              const trainsList = data.results || [];
              if (trainsList.length > 0) {
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

  const handleStationSearch = async (query: string, setSuggestions: React.Dispatch<React.SetStateAction<Station[]>>) => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const res = await fetch(`${API_URL}/stn_search?q=${query}`);
    const data = await res.json();
    setSuggestions(data.results || []);
  };

  const handleSearch = () => {
    if (!fromStn || !toStn) return;
    if (date < localToday()) {
      showToast("Travel date cannot be in the past.", "error");
      return;
    }
    if (date > localMaxDate()) {
      showToast("Booking is only allowed up to 2 months (60 days) in advance.", "error");
      return;
    }
    const fromCode = fromStn.split(' - ')[0];
    const toCode = toStn.split(' - ')[0];
    navigate(`/trains?from=${fromCode}&to=${toCode}&date=${date}&class=${classType}`);
  };

  const handleQuickBook = (fromStnFull: string, toStnFull: string) => {
    const fromCode = fromStnFull.split(' - ')[0];
    const toCode = toStnFull.split(' - ')[0];
    navigate(`/trains?from=${fromCode}&to=${toCode}&date=${localToday()}`);
  };

  const checkPnrStatus = () => {
    if (!pnrInput) return;
    if (!/^\d{10}$/.test(pnrInput.trim())) {
      showToast("Please enter a valid 10-digit numeric PNR.", "error");
      return;
    }
    navigate(`/pnr?pnr=${pnrInput.trim()}`);
  };

  const getChartStatus = () => {
    if (!chartTrain) return;
    if (chartDate < localToday()) {
      showToast("Travel date cannot be in the past.", "error");
      return;
    }
    if (chartDate > localMaxDate()) {
      showToast("Vacancy charts are only available up to 2 months (60 days) in advance.", "error");
      return;
    }
    navigate(`/charts?train=${encodeURIComponent(chartTrain.trim())}&date=${chartDate}`);
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
                      <input id="date-input" type="date" value={date} min={localToday()} max={localMaxDate()} onChange={(e) => setDate(e.target.value)} style={{ paddingLeft: '44px' }} />
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

                  <button type="button" className="search-btn" onClick={handleSearch}>
                    <Search size={22} />
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
                  >
                    Check Status
                  </button>
                </div>
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
                      min={localToday()}
                      max={localMaxDate()}
                      onChange={(e) => setChartDate(e.target.value)}
                      style={{ height: '52px', fontSize: '15px' }}
                    />
                  </div>
                  <button 
                    type="button"
                    className="btn btn-primary search-action-btn" 
                    onClick={getChartStatus}
                  >
                    Get Vacancy Chart
                  </button>
                </div>
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
