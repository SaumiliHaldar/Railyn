import { useAuth, useUser } from "@clerk/clerk-react";
import {
  Train, AlertCircle, 
  CheckCircle2, RefreshCw, X, Search,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import mqtt from "mqtt";
import Ticket from "../components/Ticket";
import { formatDate } from "../utils/dateUtils";

const API_URL  = import.meta.env.VITE_API_URL;
const MQTT_URL = "wss://broker.emqx.io:8084/mqtt";

/* ─── Framer variants ────────────────────────────────────────── */
const listVariants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0  },
};

const Dashboard = () => {
  const { getToken }  = useAuth();
  const { user }      = useUser();

  const [bookings,       setBookings]       = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [notifications,  setNotifications]  = useState<any[]>([]);
  const [selectedBooking,setSelectedBooking]= useState<any>(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [activeFilter,   setActiveFilter]   = useState("ALL");
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchError,    setSearchError]    = useState("");
  const [showConfirm,    setShowConfirm]    = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [cancelTarget,   setCancelTarget]   = useState<any>(null);
  const [paxToCancel,    setPaxToCancel]    = useState<string[]>([]);
  const mqttRef = useRef<any>(null);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        b.pnr?.toLowerCase().includes(q) ||
        b.train_name?.toLowerCase().includes(q) ||
        b.train_number?.toLowerCase().includes(q) ||
        b.from_stn?.toLowerCase().includes(q) ||
        b.to_stn?.toLowerCase().includes(q);
      
      const matchesFilter = 
        activeFilter === "ALL" || 
        (activeFilter === "CNF" && b.status === "CNF") ||
        (activeFilter === "WL"  && b.status === "WL") ||
        (activeFilter === "CANCELLED" && b.status === "CANCELLED");

      return matchesSearch && matchesFilter;
    });
  }, [bookings, searchQuery, activeFilter]);

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

  useEffect(() => {
    if (!user) return;
    const client = mqtt.connect(MQTT_URL);
    mqttRef.current = client;
    client.on("connect", () => { client.subscribe(`railyn/user/${user.id}/#`); });
    client.on("message", (topic, msg) => {
      const payload = JSON.parse(msg.toString());
      setNotifications(prev => [...prev, { ...payload, id: Date.now() }]);
      if (topic.includes("notify")) fetchBookings();
    });
    return () => { client.end(); };
  }, [user]);

  const handleCancelInit = (booking: any) => {
    setCancelTarget(booking);
    setPaxToCancel([]);
  };

  const handleConfirmCancel = async () => {
    if (paxToCancel.length === 0) return;
    setShowConfirm({
      title: "Confirm Cancellation",
      message: `Cancel ${paxToCancel.length} passenger(s)? This cannot be undone.`,
      onConfirm: async () => {
        const token = await getToken();
        await fetch(`${API_URL}/cancel_tkt`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ booking_id: cancelTarget._id, passenger_names: paxToCancel }),
        });
        setCancelTarget(null);
        fetchBookings();
      }
    });
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

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    setSearchError("");
    if (val.length === 10 && /^\d+$/.test(val)) {
      if (bookings.find(b => b.pnr === val)) return; 
      setSearchLoading(true);
      try {
        const token = await getToken();
        const res   = await fetch(`${API_URL}/pnr_status/${val}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.booking) setSelectedBooking(data.booking);
        else setSearchError("PNR not found.");
      } catch {
        setSearchError("Search failed.");
      } finally {
        setSearchLoading(false);
      }
    }
  };

  if (loading) return (
    <div className="dashboard-wrapper">
      <section className="dashboard-hero-panoramic">
        <div className="panoramic-wrapper skeleton" style={{ background: '#e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="panoramic-content">
            <div className="skeleton-box" style={{ width: '100px', height: '24px', borderRadius: '100px', marginBottom: '16px' }} />
            <div className="skeleton-box" style={{ width: '280px', height: '42px', marginBottom: '12px' }} />
            <div className="skeleton-box" style={{ width: '200px', height: '20px' }} />
          </div>
        </div>
      </section>
      <div className="dashboard-container">
        <div className="dashboard-header">
           <div className="skeleton-box skeleton-header" style={{ marginBottom: 12 }} />
           <div className="skeleton-box skeleton-line" style={{ width: '40%' }} />
        </div>
        <div className="booking-list">
          {[1,2,3].map(i => (
            <div key={i} className="skeleton-card">
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="skeleton-box skeleton-circle" />
                <div style={{ flex: 1 }}>
                  <div className="skeleton-box skeleton-header" style={{ width: '30%', marginBottom: 8 }} />
                  <div className="skeleton-box skeleton-line" style={{ width: '50%' }} />
                </div>
              </div>
              <div className="skeleton-box skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const activeCount = bookings.filter(b => b.status !== "CANCELLED").length;

  return (
    <div className="dashboard-wrapper">
      <div className="notification-stack">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div key={n.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.8 }} className="smart-toast">
              <div className="toast-header">
                {n.action_prompt ? <AlertCircle size={18} color="#fbbf24" /> : <CheckCircle2 size={18} color="#4ade80" />}
                <span>Smart Assist</span>
                <button onClick={() => setNotifications(p => p.filter(x => x.id !== n.id))}><X size={14} /></button>
              </div>
              <div className="toast-body">
                <h4>{n.title}</h4>
                <p>{n.message}</p>
                {n.action_prompt && (
                  <div className="toast-actions">
                    <button className="btn-swap" onClick={() => handleSwap(n)}><RefreshCw size={13} /> Swap Now</button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <section className="dashboard-hero-panoramic">
        <div className="panoramic-wrapper">
          <motion.div 
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="panoramic-img"
            style={{ backgroundImage: "url('/src/assets/dashboard_hero.png')" }}
          />
          <div className="panoramic-overlay" />
          <div className="panoramic-content">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-badge"
            >
              Travel Dashboard
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="panoramic-title"
            >
              Welcome back, {user?.firstName}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="panoramic-subtitle"
            >
              You have {activeCount} active trips scheduled.
            </motion.p>
          </div>
        </div>
      </section>

      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="header-row" style={{ alignItems: 'center' }}>
            <div className="header-text">
              <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="train-title">
                {activeCount} Active Trip{activeCount !== 1 ? "s" : ""}
              </motion.h2>
            </div>

            <motion.div className="pnr-search-box" style={{ width: '360px', background: 'white' }}>
              <Search size={16} style={{ color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search trip..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="pnr-search-input"
                style={{ color: 'var(--text-main)' }}
              />
              {searchLoading && <div className="search-spinner" />}
              {searchQuery && !searchLoading && <X size={14} onClick={() => setSearchQuery("")} style={{ cursor: 'pointer', color: '#94a3b8' }} />}
            </motion.div>
          </div>

          {searchError && (
            <motion.div className="search-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 12 }}>
              <AlertCircle size={14} /> {searchError}
            </motion.div>
          )}

          <div className="filter-chips">
            {['Everything', 'Confirmed', 'Waiting', 'Cancelled'].map((label, idx) => {
              const val = ['ALL', 'CNF', 'WL', 'CANCELLED'][idx];
              return (
                <button
                  key={val}
                  className={`filter-chip ${activeFilter === val ? 'active' : ''}`}
                  onClick={() => setActiveFilter(val)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="booking-list">
          {filteredBookings.length === 0 ? (
            <div className="empty-state">
              <Search size={48} color="#e2e8f0" />
              <h3>No results</h3>
            </div>
          ) : (
            <motion.div variants={listVariants} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <AnimatePresence mode='popLayout'>
                {filteredBookings.map(b => (
                  <motion.div key={b._id} layout variants={cardVariants} exit={{ opacity: 0, scale: 0.98 }} className={`ticket-card ${b.status === "CANCELLED" ? "cancelled" : ""}`}>
                    <div className="ticket-main">
                      <div className="train-info">
                        <span className="pnr-label">{b.pnr}</span>
                        <div>
                          <h3 className="train-title">{b.train_name}</h3>
                          <span className="train-subtitle">#{b.train_number}</span>
                        </div>
                        <div className="status-badge" data-status={b.status}>{b.status}</div>
                      </div>

                      <div className="route-info">
                        <span className="route-code">{b.from_stn}</span>
                        <div className="divider"><div className="line" /><Train size={14} /><div className="line" /></div>
                        <span className="route-code">{b.to_stn}</span>
                      </div>

                      <div className="passenger-brief">
                        <div className="ticket-meta-item">{formatDate(b.travel_date)}</div>
                        <div className="ticket-meta-sub">{b.departure} → {b.arrival}</div>
                      </div>
                    </div>

                    <div className="ticket-footer" style={{ border: 'none', padding: 0 }}>
                      <span className="ticket-meta-sub" style={{ fontWeight: 800 }}>{b.passengers?.length || 0} Pax · {b.class_type}</span>
                      <div className="card-actions">
                        {b.status !== "CANCELLED" && <button className="btn-cancel" style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px' }} onClick={() => handleCancelInit(b)}>Cancel</button>}
                        <button className="btn-text" style={{ color: 'var(--primary)', fontWeight: 800, opacity: 1 }} onClick={() => setSelectedBooking(b)}>Details</button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="modal-overlay" onClick={() => setShowConfirm(null)}>
            <motion.div className="confirm-dialog-card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <h3>{showConfirm.title}</h3>
              <p>{showConfirm.message}</p>
              <div className="dialog-actions">
                <button className="btn btn-outline" onClick={() => setShowConfirm(null)}>Dismiss</button>
                <button className="btn btn-primary" onClick={() => { showConfirm.onConfirm(); setShowConfirm(null); }}>Proceed</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedBooking && (
          <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
            <motion.div className="booking-modal" style={{ background: 'transparent', boxShadow: 'none', padding: 0 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
              <Ticket 
                pnr={selectedBooking.pnr}
                trainName={selectedBooking.train_name}
                trainNumber={selectedBooking.train_number}
                fromStn={selectedBooking.from_stn}
                toStn={selectedBooking.to_stn}
                departureTime={selectedBooking.departure}
                arrivalTime={selectedBooking.arrival}
                date={selectedBooking.travel_date}
                classType={selectedBooking.class_type}
                status={selectedBooking.status}
                passengers={selectedBooking.passengers || []}
              />
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setSelectedBooking(null)}>Close</button>
            </motion.div>
          </div>
        )}

        {/* Cancellation Selection */}
        {cancelTarget && (
          <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
            <motion.div className="booking-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onClick={e => e.stopPropagation()} style={{ padding: 24 }}>
              <h3>Cancel Trip</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
                {(cancelTarget.passengers || []).map((p: any) => (
                  <label key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, border: '1px solid #eee', borderRadius: 12, opacity: p.status === 'CAN' ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <input type="checkbox" disabled={p.status === 'CAN'} checked={paxToCancel.includes(p.name)} onChange={() => setPaxToCancel(prev => prev.includes(p.name) ? prev.filter(n => n !== p.name) : [...prev, p.name])} />
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800 }}>{p.status}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-outline" onClick={() => setCancelTarget(null)} style={{ flex: 1 }}>Back</button>
                <button className="btn btn-primary" style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444' }} onClick={handleConfirmCancel} disabled={paxToCancel.length === 0}>Cancel Selected</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
