import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Location } from "../domain/location";
import { DEFAULT_LOCATION, DEFAULT_LOCATION_NAME } from "../domain/location";
import { useApp } from "./AppContext";

type LocationState = {
  location: Location;
  name: string;
  setLocation: (location: Location, name: string) => void;
};

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { shabbatService } = useApp();
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);
  const [name, setName] = useState<string>(DEFAULT_LOCATION_NAME);

  useEffect(() => {
    const saved = shabbatService.initialSelection();
    setLocationState(saved.location);
    setName(saved.name);
  }, [shabbatService]);

  const setLocation = useCallback(
    (loc: Location, n: string) => {
      setLocationState(loc);
      setName(n);
    },
    [],
  );

  return (
    <LocationContext.Provider value={{ location, name, setLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
