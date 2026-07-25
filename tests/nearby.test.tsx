import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const realtime = vi.hoisted(() => {
  const presenceState: Record<string, unknown[]> = {};
  const channels: Array<{
    topic: string;
    handlers: Array<() => void>;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    presenceState: () => Record<string, unknown[]>;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  }> = [];
  return { presenceState, channels };
});

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn((topic: string) => {
    const channel = {
      topic,
      handlers: [] as Array<() => void>,
      track: vi.fn(async (payload: unknown) => {
        realtime.presenceState["user-1"] = [payload];
      }),
      untrack: vi.fn(async () => {}),
      presenceState: () => realtime.presenceState,
      on: vi.fn(
        (
          event: string,
          _filter: unknown,
          callback: () => void,
        ) => {
          if (event === "presence") channel.handlers.push(callback);
          return channel;
        },
      ),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        callback?.("SUBSCRIBED");
        return channel;
      }),
    };
    realtime.channels.push(channel);
    return channel;
  }),
  removeChannel: vi.fn(async () => {}),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: supabaseMock,
}));

import {
  activeNearbyUserIDs,
  roundPresencePosition,
  useNearbyPeople,
} from "../src/lib/nearby";
import { NearbyPeopleSettings } from "../src/components/NearbyPeopleSettings";
import { album } from "./fixtures";

function Harness() {
  const nearby = useNearbyPeople({
    user: {
      id: "user-1",
      email: "one@example.com",
      displayName: "ひなた",
    },
    canInvite: false,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => nearby.setNearbyEnabled(!nearby.enabled)}
      >
        {nearby.enabled ? "OFFにする" : "ONにする"}
      </button>
      <span>{nearby.status}</span>
      <span>{nearby.error}</span>
      {nearby.nearbyUsers.map((user) => (
        <span key={user.id}>近くに{user.displayName}さんがいます</span>
      ))}
    </>
  );
}

beforeEach(() => {
  realtime.channels.length = 0;
  for (const key of Object.keys(realtime.presenceState)) {
    delete realtime.presenceState[key];
  }
  supabaseMock.rpc.mockImplementation((name: string) => {
    if (name === "get_nearby_profiles") {
      return Promise.resolve({
        data: [{ id: "user-2", display_name: "あおい" }],
        error: null,
      });
    }
    if (name === "get_my_nearby_invitations") {
      return Promise.resolve({ data: [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  supabaseMock.from.mockReturnValue({
    select: () => ({
      eq: () => Promise.resolve({ data: [], error: null }),
    }),
  });
});

describe("近距離Presence", () => {
  it("座標を約11m単位へ丸め、更新時刻だけを付加する", () => {
    const payload = roundPresencePosition({
      latitude: 35.681236,
      longitude: 139.767125,
    });
    expect(payload.latitudeE4).toBe(356812);
    expect(payload.longitudeE4).toBe(1397671);
    expect(payload).toEqual({
      latitudeE4: 356812,
      longitudeE4: 1397671,
      updatedAt: expect.any(String),
    });
  });

  it("50m以内・5分以内だけを候補にし、既存メンバーを除外する", () => {
    const now = Date.parse("2026-07-25T10:00:00.000Z");
    const state = {
      nearby: [
        {
          latitudeE4: 356812,
          longitudeE4: 1397672,
          updatedAt: new Date(now - 60_000).toISOString(),
        },
      ],
      far: [
        {
          latitudeE4: 356900,
          longitudeE4: 1398000,
          updatedAt: new Date(now - 60_000).toISOString(),
        },
      ],
      stale: [
        {
          latitudeE4: 356812,
          longitudeE4: 1397672,
          updatedAt: new Date(now - 6 * 60_000).toISOString(),
        },
      ],
      member: [
        {
          latitudeE4: 356812,
          longitudeE4: 1397672,
          updatedAt: new Date(now - 60_000).toISOString(),
        },
      ],
    };
    expect(
      activeNearbyUserIDs(
        state,
        "self",
        { latitude: 35.6812, longitude: 139.7671 },
        new Set(["member"]),
        now,
      ),
    ).toEqual(["nearby"]);
  });

  it("初期OFFでは位置情報を要求せず、ON時だけ許可を求める", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition,
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });
    render(<Harness />);

    expect(getCurrentPosition).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "ONにする" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("許可時は近距離ユーザーを表示し、OFFでPresenceを解除する", async () => {
    const user = userEvent.setup();
    const clearWatch = vi.fn();
    realtime.presenceState["user-2"] = [
      {
        latitudeE4: 356812,
        longitudeE4: 1397672,
        updatedAt: new Date().toISOString(),
      },
    ];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(
          (success: PositionCallback) =>
            success({
              coords: {
                latitude: 35.6812,
                longitude: 139.7671,
              },
            } as GeolocationPosition),
        ),
        watchPosition: vi.fn(() => 7),
        clearWatch,
      },
    });
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "ONにする" }));
    expect(
      await screen.findByText("近くにあおいさんがいます"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "OFFにする" }));
    await waitFor(() => expect(clearWatch).toHaveBeenCalledWith(7));
    expect(supabaseMock.removeChannel).toHaveBeenCalled();
  });

  it("位置情報拒否では通常の招待方法を案内する", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(
          (_success: PositionCallback, failure: PositionErrorCallback) =>
            failure({
              code: 1,
              message: "denied",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            }),
        ),
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
    });
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "ONにする" }));
    expect(await screen.findByText(/QR・URL・招待コード/)).toBeInTheDocument();
    await act(async () => {});
  });

  it("近くの候補へ招待し、相手本人が受諾または辞退できる", async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn();
    const onRespond = vi.fn();
    const invitation = {
      id: "invite-1",
      albumId: album().id,
      albumName: album().name,
      invitedBy: "owner-1",
      invitedByName: "たろう",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
    render(
      <NearbyPeopleSettings
        enabled
        status="online"
        error=""
        album={album("owner")}
        canInvite
        nearbyUsers={[{ id: "user-2", displayName: "あおい" }]}
        incomingInvitations={[invitation]}
        onToggle={vi.fn()}
        onInvite={onInvite}
        onRespond={onRespond}
        onOpenStandardInvite={vi.fn()}
      />,
    );

    expect(screen.getByText("近くにあおいさんがいます")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "招待する" }));
    expect(onInvite).toHaveBeenCalledWith({
      id: "user-2",
      displayName: "あおい",
    });

    await user.click(screen.getByRole("button", { name: "受け取る" }));
    expect(onRespond).toHaveBeenCalledWith(invitation, true);
    await user.click(screen.getByRole("button", { name: "辞退" }));
    expect(onRespond).toHaveBeenCalledWith(invitation, false);
  });
});
