import { useEffect, useState, useCallback } from "react";
import type { NotificationPort, Remembrance } from "../application/ports";

export function useNotifications(notifications: NotificationPort, remembrances: Remembrance[]) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (!notifications.isSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, [notifications]);

  const requestPermission = useCallback(async () => {
    const granted = await notifications.requestPermission();
    setPermission(granted ? "granted" : "denied");
    return granted;
  }, [notifications]);

  // Schedule notifications for all enabled remembrances
  useEffect(() => {
    if (permission !== "granted") return;
    notifications.cancelAll();

    remembrances.forEach((record) => {
      if (!record.notifyEnabled || !record.nextIso) return;
      const daysBefore = record.notifyDaysBefore ?? 1;
      const observanceDate = new Date(record.nextIso + "T09:00:00");
      const notifyDate = new Date(observanceDate);
      notifyDate.setDate(notifyDate.getDate() - daysBefore);

      if (notifyDate > new Date()) {
        notifications.schedule(
          `Reminder: ${record.name}`,
          `${record.type} observance is in ${daysBefore} day${daysBefore === 1 ? "" : "s"} on ${record.nextFormatted || record.nextIso}`,
          notifyDate,
        );
      }
    });
  }, [notifications, permission, remembrances]);

  return { permission, requestPermission, isSupported: notifications.isSupported() };
}
