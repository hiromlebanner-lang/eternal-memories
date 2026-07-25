import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppUser,
  NearbyInvitation,
  NearbyUser,
} from "../types";
import { distanceInMeters } from "./location";
import { supabase } from "./supabase";

const NEARBY_TOPIC = "nearby-users";
const MAX_DISTANCE_METERS = 100;
const MAX_AGE_MS = 5 * 60 * 1_000;
const HEARTBEAT_MS = 60_000;
const COORDINATE_SCALE = 10_000;
const MAX_ACCEPTABLE_ACCURACY_METERS = 200;

type PresencePayload = {
  userId: string;
  displayName: string;
  latitudeE4: number;
  longitudeE4: number;
  updatedAt: string;
};

type NearbyProfileRow = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
};

type NearbyInvitationRow = {
  id: string;
  album_id: string;
  album_name: string;
  invited_by: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabaseが設定されていません。");
  return supabase;
}

export function roundPresencePosition(position: {
  userId: string;
  displayName: string;
  latitude: number;
  longitude: number;
}): PresencePayload {
  return {
    userId: position.userId,
    displayName: position.displayName.slice(0, 80),
    latitudeE4: Math.round(position.latitude * COORDINATE_SCALE),
    longitudeE4: Math.round(position.longitude * COORDINATE_SCALE),
    updatedAt: new Date().toISOString(),
  };
}

export function activeNearbyUserIDs(
  presenceState: Record<string, unknown[]>,
  ownUserID: string,
  ownPosition: { latitude: number; longitude: number },
  excludedUserIDs: ReadonlySet<string>,
  now = Date.now(),
) {
  const result: string[] = [];

  for (const [userID, rawPresences] of Object.entries(presenceState)) {
    if (userID === ownUserID || excludedUserIDs.has(userID)) continue;

    const latest = rawPresences
      .map((presence) => presence as Partial<PresencePayload>)
      .filter(
        (presence): presence is PresencePayload =>
          Number.isInteger(presence.latitudeE4) &&
          Number.isInteger(presence.longitudeE4) &&
          presence.userId === userID &&
          typeof presence.displayName === "string" &&
          typeof presence.updatedAt === "string",
      )
      .sort(
        (first, second) =>
          Date.parse(second.updatedAt) - Date.parse(first.updatedAt),
      )[0];
    if (!latest) continue;

    const updatedAt = Date.parse(latest.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt > MAX_AGE_MS) continue;

    const distance = distanceInMeters(ownPosition, {
      latitude: latest.latitudeE4 / COORDINATE_SCALE,
      longitude: latest.longitudeE4 / COORDINATE_SCALE,
    });
    if (distance <= MAX_DISTANCE_METERS) result.push(userID);
  }

  return result;
}

export async function loadNearbyProfileNames(userIDs: string[]) {
  if (userIDs.length === 0) return new Map<string, string>();
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_nearby_profiles", {
    p_user_ids: userIDs.slice(0, 50),
  });
  if (error) throw error;

  return new Map(
    ((data ?? []) as NearbyProfileRow[]).map((profile) => [
      profile.id,
      profile.display_name,
    ]),
  );
}

async function loadNearbyProfileCards(userIDs: string[]) {
  if (userIDs.length === 0) {
    return new Map<string, { displayName: string; avatarUrl: string | null }>();
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_nearby_profile_cards", {
    p_user_ids: userIDs.slice(0, 50),
  });
  if (error) throw error;
  return new Map(
    ((data ?? []) as NearbyProfileRow[]).map((profile) => [
      profile.id,
      {
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url ?? null,
      },
    ]),
  );
}

export async function loadAlbumMemberIDs(albumID: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("album_members")
    .select("user_id")
    .eq("album_id", albumID);
  if (error) throw error;
  return (data ?? []).map((row) => row.user_id as string);
}

export async function createNearbyInvitation(
  albumID: string,
  invitedUserID: string,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_nearby_invitation", {
    p_album_id: albumID,
    p_invited_user_id: invitedUserID,
  });
  if (error) throw error;
  return data as string;
}

export async function loadIncomingNearbyInvitations(): Promise<
  NearbyInvitation[]
> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_my_nearby_invitations");
  if (error) throw error;

  return ((data ?? []) as NearbyInvitationRow[]).map((row) => ({
    id: row.id,
    albumId: row.album_id,
    albumName: row.album_name,
    invitedBy: row.invited_by,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export async function respondToNearbyInvitation(
  invitationID: string,
  accept: boolean,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("respond_nearby_invitation", {
    p_invitation_id: invitationID,
    p_accept: accept,
  });
  if (error) throw error;
  return data as string | null;
}

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "位置情報が許可されませんでした。QR・URL・招待コードは引き続き利用できます。";
  }
  if (error.code === error.TIMEOUT) {
    return "位置情報の取得がタイムアウトしました。QR・URL・招待コードは引き続き利用できます。";
  }
  return "位置情報を取得できませんでした。QR・URL・招待コードは引き続き利用できます。";
}

export function useNearbyPeople(input: {
  user: AppUser;
  selectedAlbumID?: string;
  canInvite: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<
    "off" | "locating" | "online" | "offline" | "unavailable"
  >("off");
  const [error, setError] = useState("");
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<
    NearbyInvitation[]
  >([]);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const watchIDRef = useRef<number | undefined>(undefined);
  const heartbeatRef = useRef<number | undefined>(undefined);
  const ownPositionRef = useRef<{
    latitude: number;
    longitude: number;
  } | undefined>(undefined);
  const excludedUserIDsRef = useRef(new Set<string>([input.user.id]));
  const generationRef = useRef(0);

  const stopPresence = useCallback(async () => {
    generationRef.current += 1;
    if (watchIDRef.current !== undefined && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIDRef.current);
      watchIDRef.current = undefined;
    }
    if (heartbeatRef.current !== undefined) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = undefined;
    }

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && supabase) {
      await channel.untrack().catch(() => undefined);
      await supabase.removeChannel(channel);
    }
    ownPositionRef.current = undefined;
    setNearbyUsers([]);
  }, []);

  const refreshIncomingInvitations = useCallback(async () => {
    try {
      setIncomingInvitations(await loadIncomingNearbyInvitations());
    } catch {
      setIncomingInvitations([]);
    }
  }, []);

  useEffect(() => {
    const updateVisibility = () =>
      setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const online = () => setNetworkOnline(true);
    const offline = () => setNetworkOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    excludedUserIDsRef.current = new Set([input.user.id]);
    if (!input.selectedAlbumID || !input.canInvite) return;

    let active = true;
    void loadAlbumMemberIDs(input.selectedAlbumID)
      .then((ids) => {
        if (active) {
          excludedUserIDsRef.current = new Set([input.user.id, ...ids]);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [input.canInvite, input.selectedAlbumID, input.user.id]);

  useEffect(() => {
    if (!enabled || !pageVisible) {
      void stopPresence();
      if (!enabled) {
        setStatus("off");
        setIncomingInvitations([]);
      }
      return;
    }

    if (!networkOnline) {
      void stopPresence();
      setStatus("offline");
      setError(
        "オフラインのため近くの人を検索できません。接続後に自動で再開します。",
      );
      return;
    }

    if (!supabase || !navigator.geolocation) {
      setError(
        "この端末では位置情報を利用できません。QR・URL・招待コードをご利用ください。",
      );
      setStatus("unavailable");
      setEnabled(false);
      return;
    }

    const client = supabase;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setStatus("locating");
    setError("");

    const refreshNearby = async (channel: RealtimeChannel) => {
      const ownPosition = ownPositionRef.current;
      if (!ownPosition || generationRef.current !== generation) return;
      const ids = activeNearbyUserIDs(
        channel.presenceState() as Record<string, unknown[]>,
        input.user.id,
        ownPosition,
        excludedUserIDsRef.current,
      );
      try {
        const profiles = await loadNearbyProfileCards(ids);
        if (generationRef.current !== generation) return;
        setNearbyUsers(
          ids
            .map((id) => ({
              id,
              displayName: profiles.get(id)?.displayName ?? "",
              avatarUrl: profiles.get(id)?.avatarUrl ?? null,
            }))
            .filter((candidate) => candidate.displayName),
        );
      } catch {
        if (generationRef.current === generation) setNearbyUsers([]);
      }
    };

    const trackPosition = async (
      position: { latitude: number; longitude: number },
      channel: RealtimeChannel,
    ) => {
      ownPositionRef.current = position;
      await channel.track(
        roundPresencePosition({
          ...position,
          userId: input.user.id,
          displayName: input.user.displayName,
        }),
      );
      await refreshNearby(channel);
    };

    const start = (position: GeolocationPosition) => {
      if (generationRef.current !== generation) return;
      if (
        Number.isFinite(position.coords.accuracy) &&
        position.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS
      ) {
        setError(
          "GPSの精度が十分ではありません。空が見える場所で再度ONにするか、QR・URL・招待コードをご利用ください。",
        );
        setStatus("unavailable");
        setEnabled(false);
        return;
      }
      const initialPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      ownPositionRef.current = initialPosition;

      const channel = client
        .channel(NEARBY_TOPIC, {
          config: {
            private: true,
            presence: { key: input.user.id },
          },
        })
        .on("presence", { event: "sync" }, () => {
          void refreshNearby(channel);
        });
      channel.subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          void trackPosition(initialPosition, channel);
          setStatus("online");
          void refreshIncomingInvitations();
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT"
        ) {
          setError(
            "近距離検索へ接続できませんでした。SupabaseのRealtime設定を確認するか、QR・URL・招待コードをご利用ください。",
          );
          setStatus("unavailable");
          setEnabled(false);
        }
      });
      channelRef.current = channel;

      watchIDRef.current = navigator.geolocation.watchPosition(
        (nextPosition) => {
          if (
            Number.isFinite(nextPosition.coords.accuracy) &&
            nextPosition.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS
          ) {
            setError(
              "GPSの精度を確認しています。空が見える場所へ移動してください。",
            );
            return;
          }
          setError("");
          void trackPosition(
            {
              latitude: nextPosition.coords.latitude,
              longitude: nextPosition.coords.longitude,
            },
            channel,
          );
        },
        (nextError) => {
          setError(locationErrorMessage(nextError));
          setStatus("unavailable");
          setEnabled(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 15_000,
        },
      );

      heartbeatRef.current = window.setInterval(() => {
        const latestPosition = ownPositionRef.current;
        if (latestPosition && document.visibilityState === "visible") {
          void trackPosition(latestPosition, channel);
        }
      }, HEARTBEAT_MS);
    };

    navigator.geolocation.getCurrentPosition(
      start,
      (locationError) => {
        if (generationRef.current !== generation) return;
        setError(locationErrorMessage(locationError));
        setStatus("unavailable");
        setEnabled(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 15_000,
      },
    );

    const invitationChannel = client
      .channel(`nearby-invitations:${input.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nearby_invitations",
          filter: `invited_user_id=eq.${input.user.id}`,
        },
        () => void refreshIncomingInvitations(),
      )
      .subscribe();

    const pageHide = () => {
      const channel = channelRef.current;
      if (channel) void channel.untrack();
    };
    window.addEventListener("pagehide", pageHide);

    return () => {
      window.removeEventListener("pagehide", pageHide);
      void client.removeChannel(invitationChannel);
      void stopPresence();
    };
  }, [
    enabled,
    input.user.id,
    input.user.displayName,
    networkOnline,
    pageVisible,
    refreshIncomingInvitations,
    stopPresence,
  ]);

  const setNearbyEnabled = useCallback((nextEnabled: boolean) => {
    setError("");
    setEnabled(nextEnabled);
  }, []);

  return {
    enabled,
    status,
    error,
    nearbyUsers,
    incomingInvitations,
    setNearbyEnabled,
    stopPresence,
    refreshIncomingInvitations,
  };
}
