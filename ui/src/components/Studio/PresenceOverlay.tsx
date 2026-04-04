import { useViewport } from '@xyflow/react';

interface PresenceUser {
  name: string;
  color: string;
  cursor?: { x: number, y: number };
}

interface PresenceOverlayProps {
  users: Array<{ user: PresenceUser }>;
}

export function PresenceOverlay({ users }: PresenceOverlayProps) {
  const { zoom } = useViewport();

  return (
    <div className="absolute inset-0 pointer-events-none z-[9999] overflow-hidden">
      {users.map((u, i) => (
        u.user?.cursor && (
          <div
            key={i}
            className="absolute transition-all duration-75"
            style={{
              left: u.user.cursor.x,
              top: u.user.cursor.y,
              transform: `scale(${1 / Math.max(zoom, 0.5)})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="relative">
              {/* Ghost Cursor Icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-lg"
              >
                <path
                  d="M1 1V11.5L4.5 9L6.5 14L8.5 13L6.5 8L11 7.5L1 1Z"
                  fill={u.user.color}
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
              
              {/* User Label */}
              <div
                className="absolute left-4 top-4 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest text-white shadow-xl whitespace-nowrap"
                style={{ backgroundColor: u.user.color }}
              >
                {u.user.name}
              </div>
            </div>
          </div>
        )
      ))}
    </div>
  );
}
