import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Train, Clock, ChevronRight, AlertCircle, Calendar, 
  CheckCircle2, RefreshCw, X, Search,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import mqtt from "mqtt";
import Ticket from "../components/Ticket";

const API_URL  = import.meta.env.VITE_API_URL;
const MQTT_URL = "wss://broker.emqx.io:8084/mqtt";

/* ─── Framer variants ────────────────────────────────────────── */
const listVariants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.09 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show:   { opacity: 1, y: 0,  scale: 1    },
};

/* ─── Component ──────────────────────────────────────────────── */
const Dashboard = () => {
  const { getToken }  = useAuth();
  const { user }      = useUser();

  const [bookings,       setBookings]       = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [notifications,  setNotifications]  = useState<any[]>([]);
  const [selectedBooking,setSelectedBooking]= useState<any>(null);
  const [pnrSearch,      setPnrSearch]      = useState("");
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchError,    setSearchError]    = useState("");
  const [cancelTarget,   setCancelTarget]   = useState<any>(null);
  const [paxToCancel,    setPaxToCancel]    = useState<string[]>([]);
  const mqttRef = useRef<any>(null);

  /* ─── Fetch bookings ─────────── */
  const fetchBookings = async () => {
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/my_bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) fetchBookings(); }, [user]);

  /* ─── MQTT ───────────────────── */
  useEffect(() => {
    if (!user) return;
    const client = mqtt.connect(MQTT_URL);
    mqttRef.current = client;

    client.on("connect", () => {
      client.subscribe(`railyn/user/${user.id}/#`);
    });
    client.on("message", (topic, msg) => {
      const payload = JSON.parse(msg.toString());
      setNotifications(prev => [...prev, { ...payload, id: Date.now() }]);
      if (topic.includes("notify")) fetchBookings();
    });
    return () => { client.end(); };
  }, [user]);

  /* ─── Actions ────────────────── */
  const handleCancelInit = (booking: any) => {
    setCancelTarget(booking);
    setPaxToCancel([]); // Reset selection
  };

  const handleConfirmCancel = async () => {
    if (paxToCancel.length === 0) return alert("Please select at least one passenger to cancel.");
    if (!window.confirm(`Cancel ${paxToCancel.length} passenger(s)?`)) return;

    const token = await getToken();
    await fetch(`${API_URL}/cancel_tkt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ 
        booking_id: cancelTarget._id,
        passenger_names: paxToCancel
      }),
    });
    setCancelTarget(null);
    fetchBookings();
  };

  const handleSwap = async (n: any) => {
    const token = await getToken();
    await fetch(`${API_URL}${n.action_endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(n.payload),
    });
    setNotifications(prev => prev.filter(x => x.id !== n.id));
    fetchBookings();
  };

  const handlePnrSearch = async (val: string) => {
    setPnrSearch(val);
    setSearchError("");
    if (val.length < 10) return;
    setSearchLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${API_URL}/search_booking/${val}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSelectedBooking(await res.json());
      } else {
        setSearchError("No booking found with this PNR.");
      }
    } catch {
      setSearchError("Search failed. Try again.");
    }
    setSearchLoading(false);
  };

  /* ─── Loading screen ─────────── */
  if (loading) return (
    <div className="loading-container">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
        <Train size={48} color="#1E6F2B" />
      </motion.div>
      <p>Fetching your tickets…</p>
    </div>
  );

  const activeCount = bookings.filter(b => b.status !== "CANCELLED").length;

  /* ─── Render ─────────────────── */
  return (
    <div className="dashboard-wrapper">

      {/* ── MQTT Toast Stack ────────────────────────────────── */}
      <div className="notification-stack">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0,  scale: 1     }}
              exit={{    opacity: 0, scale: 0.6            }}
              className="smart-toast"
            >
              <div className="toast-header">
                {n.action_prompt
                  ? <AlertCircle size={18} color="#fbbf24" />
                  : <CheckCircle2 size={18} color="#4ade80" />}
                <span>Smart Assist</span>
                <button onClick={() => setNotifications(p => p.filter(x => x.id !== n.id))}>
                  <X size={14} />
                </button>
              </div>
              <div className="toast-body">
                <h4>{n.title}</h4>
                <p>{n.message}</p>
                {n.action_prompt && (
                  <div className="toast-actions">
                    <p className="prompt">{n.action_prompt}</p>
                    <button className="btn-swap" onClick={() => handleSwap(n)}>
                      <RefreshCw size={13} /> Swap Now
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Main Container ──────────────────────────────────── */}
      <div className="dashboard-container">

        {/* Header */}
        <div className="dashboard-header">
          <div className="header-row">
            <div className="header-text">
              <motion.h1
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
              >
                My Dashboard
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.65 }}
                transition={{ delay: 0.18 }}
              >
                Welcome back, <strong>{user?.firstName}</strong>.
                You have <strong>{activeCount}</strong> active booking{activeCount !== 1 ? "s" : ""}.
              </motion.p>
            </div>

            {/* PNR Search */}
            <motion.div
              className="pnr-search-box"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
            >
              <Search size={15} className="search-icon" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="Search PNR…"
                value={pnrSearch}
                onChange={e => handlePnrSearch(e.target.value.replace(/\D/g, ""))}
                className="pnr-search-input"
              />
              {searchLoading && <div className="search-spinner" />}
              {pnrSearch && !searchLoading && (
                <button
                  className="clear-search"
                  onClick={() => { setPnrSearch(""); setSearchError(""); }}
                >
                  <X size={13} />
                </button>
              )}
            </motion.div>
          </div>

          {searchError && (
            <motion.div className="search-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AlertCircle size={13} /> {searchError}
            </motion.div>
          )}
        </div>

        {/* Grid */}
        <div className="dashboard-grid">

          {/* ── Booking List ────────────────────────────────── */}
          {bookings.length === 0 ? (
            <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AlertCircle size={56} color="#555" />
              <h3>No Bookings Yet</h3>
              <p>Ready to explore India? Book your first train now.</p>
              <a href="/" className="btn btn-primary" style={{ marginTop: 20, textDecoration: "none", display: "inline-block" }}>
                Book a Train
              </a>
            </motion.div>
          ) : (
            <motion.div className="booking-list" variants={listVariants} initial="hidden" animate="show">
              {bookings.map(b => (
                <motion.div
                  key={b._id}
                  variants={cardVariants}
                  className={`ticket-card${b.status === "CANCELLED" ? " cancelled" : ""}`}
                >
                  {/* ── Card Top ── */}
                  <div className="ticket-main">

                    {/* Train info column */}
                    <div className="train-info">
                      <span className="pnr">PNR: {b.pnr}</span>
                      <h3>
                        {b.train_name}
                        <small className="train-num"> #{b.train_number}</small>
                      </h3>
                      <div className="status-badge" data-status={b.status}>
                        {b.status}{b.wl_position ? ` (${b.wl_position})` : ""}
                      </div>
                    </div>

                    {/* Route visual */}
                    <div className="route-info">
                      <div className="stn">
                        <span className="code">{b.from_stn}</span>
                        <span className="label">Origin</span>
                      </div>
                      <div className="divider">
                        <div className="line" />
                        <Train size={16} />
                        <div className="line" />
                      </div>
                      <div className="stn">
                        <span className="code">{b.to_stn}</span>
                        <span className="label">Destination</span>
                      </div>
                    </div>

                    {/* Meta column */}
                    <div className="passenger-brief">
                      <div className="item">
                        <Calendar size={13} />
                        <span>{b.travel_date}</span>
                      </div>
                      <div className="item">
                        <Clock size={13} />
                        <span>{b.departure} → {b.arrival}</span>
                      </div>
                      <div className="item accent">
                        <span>Coach {b.coach} · Seat {b.seat}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Card Bottom ── */}
                  <div className="ticket-footer">
                    <span className="passenger-label">
                      {b.passengers?.length || 0} {b.passengers?.length === 1 ? 'Passenger' : 'Passengers'} · {b.class_type}
                    </span>
                    <div className="card-actions">
                      {b.status !== "CANCELLED" && (
                        <button className="btn-cancel" onClick={() => handleCancelInit(b)}>
                          Cancel
                        </button>
                      )}
                      <button className="btn-text" onClick={() => setSelectedBooking(b)}>
                        Details <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

        </div>
      </div>

      {/* ── Ticket Detail Modal ──────────────────────────────── */}
      <AnimatePresence>
        {selectedBooking && (
          <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
            <motion.div
              className="booking-modal"
              style={{ background: 'transparent', padding: 0, maxWidth: 520, boxShadow: 'none' }}
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.88, y: 24 }}
              onClick={e => e.stopPropagation()}
            >

              <div className="ticket-wrapper">
                <Ticket
                  pnr={selectedBooking.pnr}
                  trainName={selectedBooking.train_name}
                  trainNumber={selectedBooking.train_number}
                  departureTime={selectedBooking.departure}
                  arrivalTime={selectedBooking.arrival}
                  fromStn={selectedBooking.from_stn}
                  toStn={selectedBooking.to_stn}
                  date={selectedBooking.travel_date}
                  classType={selectedBooking.class_type}
                  passengers={selectedBooking.passengers || [{
                    name: selectedBooking.passenger_name,
                    age: selectedBooking.passenger_age,
                    coach: selectedBooking.coach,
                    seat: selectedBooking.seat,
                    status: selectedBooking.status
                  }]}
                  status={selectedBooking.status}
                />
              </div>

              <div style={{ padding: "16px 20px" }}>
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={() => setSelectedBooking(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Cancellation Selection Modal ── */}
        {cancelTarget && (
          <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
            <motion.div 
              className="booking-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 450, padding: '24px' }}
            >
              <div className="modal-header" style={{ border: 'none', padding: 0, marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', color: '#111827' }}>Cancel Passengers</h2>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Select members to remove from PNR {cancelTarget.pnr}</p>
                </div>
                <button className="close-btn" onClick={() => setCancelTarget(null)} style={{ top: 0, right: 0 }}><X size={20}/></button>
              </div>

              <div className="pax-cancel-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {(cancelTarget.passengers || []).map((p: any, idx: number) => {
                  const isAlreadyCan = p.status === 'CAN';
                  const isSelected = paxToCancel.includes(p.name);
                  
                  return (
                    <label key={idx} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: `1px solid ${isSelected ? '#1E6F2B' : '#e5e7eb'}`,
                      background: isAlreadyCan ? '#f9fafb' : (isSelected ? '#f0fdf4' : 'white'),
                      cursor: isAlreadyCan ? 'not-allowed' : 'pointer',
                      opacity: isAlreadyCan ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input 
                          type="checkbox" 
                          disabled={isAlreadyCan}
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) setPaxToCancel(prev => prev.filter(n => n !== p.name));
                            else setPaxToCancel(prev => [...prev, p.name]);
                          }}
                          style={{ accentColor: '#1E6F2B', width: 18, height: 18 }}
                        />
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{p.name}</p>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Seat {p.coach}-{p.seat}</span>
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        color: isAlreadyCan ? '#ef4444' : '#10b981',
                        background: isAlreadyCan ? '#fef2f2' : '#ecfdf5',
                        padding: '2px 8px',
                        borderRadius: '99px'
                      }}>
                        {p.status}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setCancelTarget(null)}>Dismiss</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444' }}
                  onClick={handleConfirmCancel}
                  disabled={paxToCancel.length === 0}
                >
                  Cancel Selected
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
