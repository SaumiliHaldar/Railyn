import math

class FareEngine:
    """
    Indian Railways Fare Engine (2025-2026 Updated Rates)
    Based on distance-based slabs for Ordinary, Express, and Superfast services.
    """
    
    # Base Fare Slabs for Ordinary Services (Approximate based on provided 2025-26 data)
    # Distance (km) -> {Class: Base Fare}
    SLABS = {
        5: {"General": 4, "Sleeper": 23, "3AC": 72, "2AC": 100, "1AC": 150},
        10: {"General": 6, "Sleeper": 28, "3AC": 85, "2AC": 120, "1AC": 180},
        20: {"General": 10, "Sleeper": 35, "3AC": 110, "2AC": 155, "1AC": 235},
        40: {"General": 15, "Sleeper": 50, "3AC": 160, "2AC": 225, "1AC": 340},
        60: {"General": 18, "Sleeper": 65, "3AC": 210, "2AC": 295, "1AC": 445},
        80: {"General": 22, "Sleeper": 85, "3AC": 270, "2AC": 380, "1AC": 570},
        100: {"General": 25, "Sleeper": 105, "3AC": 330, "2AC": 465, "1AC": 700},
        120: {"General": 28, "Sleeper": 125, "3AC": 395, "2AC": 555, "1AC": 835},
        145: {"General": 32, "Sleeper": 147, "3AC": 465, "2AC": 655, "1AC": 985},
    }

    # Reservation Charges (Fixed per passenger)
    RESERVATION_CHARGES = {
        "General": 0,
        "Sleeper": 20,
        "3AC": 40,
        "2AC": 50,
        "1AC": 60
    }

    # Superfast Charges (Fixed per passenger if train_type is Superfast)
    SUPERFAST_CHARGES = {
        "General": 15,
        "Sleeper": 30,
        "3AC": 45,
        "2AC": 45,
        "1AC": 75
    }

    @classmethod
    def get_base_fare(cls, distance, class_type):
        """Finds the base fare for a given distance slab."""
        # Find the appropriate slab
        sorted_slabs = sorted(cls.SLABS.keys())
        selected_dist = sorted_slabs[-1] # Default to max
        for d in sorted_slabs:
            if distance <= d:
                selected_dist = d
                break
        
        # Linear interpolation for distances beyond defined slabs
        if distance > 145:
            # Approx incremental rate per km for distances > 145
            rates = {"General": 0.22, "Sleeper": 1.0, "3AC": 3.2, "2AC": 4.5, "1AC": 6.8}
            base = cls.SLABS[145].get(class_type, 147)
            extra = (distance - 145) * rates.get(class_type, 1.0)
            return int(base + extra)
            
        return cls.SLABS[selected_dist].get(class_type, 147)

    @classmethod
    def calculate_fare(cls, distance, class_type, train_type="Express", age=30):
        """
        Calculates the final fare with all components.
        Returns a dictionary with breakdown.
        """
        base_fare = cls.get_base_fare(distance, class_type)
        
        # Child Concession (5-12 years): 50% of Base Fare
        is_child = 5 <= age <= 12
        calculated_base = int(base_fare * 0.5) if is_child else base_fare
        
        resv_charge = cls.RESERVATION_CHARGES.get(class_type, 0)
        sf_charge = cls.SUPERFAST_CHARGES.get(class_type, 0) if "Superfast" in train_type or "SF" in train_type else 0
        
        # Total before GST
        subtotal = calculated_base + resv_charge + sf_charge
        
        # GST (5% only on AC classes)
        gst = 0
        if class_type in ["3AC", "2AC", "1AC"]:
            gst = math.ceil(subtotal * 0.05)
            
        total = subtotal + gst
        
        return {
            "base_fare": calculated_base,
            "resv_charge": resv_charge,
            "sf_charge": sf_charge,
            "gst": gst,
            "total": total,
            "distance": distance,
            "class": class_type
        }
