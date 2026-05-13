import React, { useEffect, useState } from 'react';
import { Train } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const API_URL = import.meta.env.VITE_API_URL;

interface PassengerInfo {
  name: string;
  age: number | string;
  coach: string;
  seat: string | number;
  status: string;
}

interface TicketProps {
  pnr: string;
  trainName: string;
  trainNumber: string;
  departureTime: string;
  arrivalTime: string;
  fromStn: string;
  toStn: string;
  date: string;
  classType: string;
  passengers: PassengerInfo[];
  status: string;
}

const Ticket: React.FC<TicketProps> = ({
  pnr,
  trainName,
  trainNumber,
  departureTime,
  arrivalTime,
  fromStn,
  toStn,
  date,
  classType,
  passengers = [],
  status
}) => {
  const [qrData, setQrData] = useState<string | null>(null);
  const primaryPax = passengers[0] || { name: 'N/A', age: 'N/A' };

  useEffect(() => {
    if (!pnr) return;

    // Use primary passenger and count for QR
    const params = new URLSearchParams({
      name:       primaryPax.name,
      age:        String(primaryPax.age),
      pax_count:  String(passengers.length),
      train_no:   trainNumber,
      from_stn:   fromStn,
      to_stn:     toStn,
      date:       date,
      class_type: classType,
    });

    fetch(`${API_URL}/qr/${pnr}?${params.toString()}`)
      .then(res => res.json())
      .then(data => setQrData(data.qr_data))
      .catch(() => setQrData(null));
  }, [pnr, passengers.length]);

  return (
    <div className="physical-ticket">
      <div className="ticket-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="label">Passenger</span>
            <h2 className="passenger-name">
              {primaryPax.name} 
              {passengers.length > 1 && <span style={{ fontSize: '14px', opacity: 0.6, fontWeight: 500 }}> + {passengers.length - 1} more</span>}
            </h2>
            <div className="ticket-train-info">
              <span className="ticket-train-name">{trainName}</span>
              <span className="ticket-train-number">
                <span className="label-tiny">Train No.</span> {trainNumber}
              </span>
            </div>
          </div>
          <div className="status-badge" data-status={status} style={{ margin: 0, flexShrink: 0 }}>
            {status}
          </div>
        </div>
        
        <div className="ticket-route-row" style={{ marginTop: '20px' }}>
          <div className="time">{departureTime || '-'}</div>
          <div className="duration">{formatDate(date)}</div>
          <div className="time">{arrivalTime || '-'}</div>
        </div>

        <div className="ticket-visual-path">
          <div className="dot"></div>
          <div className="path-line"><div className="train-icon-box"><Train size={13} /></div></div>
          <div className="dot"></div>
        </div>

        <div className="ticket-stn-row">
          <div className="stn-name">
            <div className="stn-city">{fromStn}</div>
            <div className="stn-full">Source</div>
          </div>
          <div className="stn-name" style={{ textAlign: 'right' }}>
            <div className="stn-city">{toStn}</div>
            <div className="stn-full">Destination</div>
          </div>
        </div>
      </div>

      <div className="ticket-divider">
        <div className="dotted-line"></div>
      </div>

      <div className="ticket-footer-details">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <div className="booking-ref-box">
              <span className="label">Booking Reference (PNR)</span>
              <div className="ref-num">{pnr}</div>
            </div>

            <span className="label" style={{ marginBottom: '8px' }}>Passengers & Seats</span>
            <div className="pax-seats-list" style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {passengers.map((p, idx) => {
                const isCancelled = p.status === 'CAN';
                return (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '6px 0', 
                    borderBottom: '1px solid #eee',
                    opacity: isCancelled ? 0.45 : 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{p.name} <small style={{ opacity: 0.5 }}>({p.age})</small></span>
                      {isCancelled && <span style={{ fontSize: '10px', background: '#FF4D4D', color: 'white', padding: '1px 4px', borderRadius: '4px', fontWeight: 900 }}>CAN</span>}
                    </div>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 800, 
                      color: isCancelled ? '#888' : '#1E6F2B',
                      textDecoration: isCancelled ? 'line-through' : 'none'
                    }}>{p.coach}-{p.seat}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="qr-panel">
            {qrData ? (
              <img src={qrData} alt={`QR Code for PNR ${pnr}`} className="qr-img" />
            ) : (
              <div className="qr-loading"><div className="qr-shimmer"></div></div>
            )}
            <div className="qr-label">Scan to Verify</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Ticket;
