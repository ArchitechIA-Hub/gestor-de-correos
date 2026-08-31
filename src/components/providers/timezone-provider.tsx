"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TIME_ZONE } from "@/lib/format/timezone";

const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

/**
 * Propaga la zona horaria del usuario (leída en servidor desde `AppSettings`)
 * a los componentes cliente que formatean fechas.
 */
export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
