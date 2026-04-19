'use client';
// app/hooks/useDrivers.ts
import { useState, useEffect, useCallback } from 'react';
import { Driver } from '../types';

export function useDrivers(pollInterval = 30000) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'navpro_api' | 'demo'>('demo');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetch = useCallback(async () => {
    try {
      const res = await window.fetch('/api/drivers');
      const data = await res.json();
      if (data.drivers) {
        setDrivers(data.drivers);
        setDataSource(data.data_source);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, pollInterval);
    return () => clearInterval(id);
  }, [fetch, pollInterval]);

  return { drivers, loading, error, dataSource, lastUpdated, refetch: fetch };
}

export function useAlerts(pollInterval = 15000) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const res = await window.fetch('/api/alerts');
      const data = await res.json();
      if (data.alerts) setAlerts(data.alerts);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, pollInterval);
    return () => clearInterval(id);
  }, [fetch, pollInterval]);

  return { alerts, loading };
}
