import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Location, SavedLocation } from "../domain/location";
import { DEFAULT_LOCATION, DEFAULT_LOCATION_NAME } from "../domain/location";
import { useApp } from "./AppContext";

type LocationState = {
  location: Location;
  name: string;
  setLocation: (location: Location, name: string) => void;
  savedLocations: SavedLocation[];
  saveCurrentLocation: () => SavedLocation | undefined;
  removeSavedLocation: (id: string) => void;
  setDefaultLocation: (id: string) => void;
};

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { shabbatService, multiLocationStore } = useApp();
  const [location, setLocationState] = useState<Location>(DEFAULT_LOCATION);
  const [name, setName] = useState<string>(DEFAULT_LOCATION_NAME);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

  useEffect(() => {
    const savedDefault = multiLocationStore.getDefault();
    if (savedDefault) {
      setLocationState(savedDefault.location);
      setName(savedDefault.name);
    } else {
      const last = shabbatService.initialSelection();
      setLocationState(last.location);
      setName(last.name);
    }
    setSavedLocations(multiLocationStore.list());
  }, [shabbatService, multiLocationStore]);

  const setLocation = useCallback((loc: Location, n: string) => {
    setLocationState(loc);
    setName(n);
  }, []);

  const saveCurrentLocation = useCallback(() => {
    const saved = multiLocationStore.add(name, location);
    setSavedLocations(multiLocationStore.list());
    return saved;
  }, [multiLocationStore, name, location]);

  const removeSavedLocation = useCallback((id: string) => {
    setSavedLocations(multiLocationStore.remove(id));
  }, [multiLocationStore]);

  const setDefaultLocation = useCallback((id: string) => {
    setSavedLocations(multiLocationStore.setDefault(id));
  }, [multiLocationStore]);

  return (
    <LocationContext.Provider value={{
      location, name, setLocation,
      savedLocations, saveCurrentLocation, removeSavedLocation, setDefaultLocation,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
