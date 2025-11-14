'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Direction = Point;

type ControlMap = {
  up: string;
  down: string;
  left: string;
  right: string;
};

type PlayerConfig = {
  id: string;
  name: string;
  color: string;
  accent: string;
  trailColor: string;
  spawn: Point;
  direction: Direction;
  controls: ControlMap;
};

type PlayerRuntime = PlayerConfig & {
  position: Point;
  direction: Direction;
  nextDirection: Direction;
};

type GameStatus = "idle" | "running" | "ended";

type GameEngine = {
  players: PlayerRuntime[];
  ctx: CanvasRenderingContext2D;
  trails: Set<string>;
  intervalId: number | null;
  running: boolean;
};

const GRID_COLS = 64;
const GRID_ROWS = 36;
const CELL_SIZE = 18;
const CANVAS_WIDTH = GRID_COLS * CELL_SIZE;
const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;
const TICK_MS = 70;

const playerConfigs: PlayerConfig[] = [
  {
    id: "p1",
    name: "Photon",
    color: "#0ff9ff",
    accent: "#68fff9",
    trailColor: "rgba(0, 255, 255, 0.45)",
    spawn: { x: Math.floor(GRID_COLS * 0.2), y: Math.floor(GRID_ROWS / 2) },
    direction: { x: 1, y: 0 },
    controls: {
      up: "w",
      down: "s",
      left: "a",
      right: "d",
    },
  },
  {
    id: "p2",
    name: "Laser",
    color: "#ff64ff",
    accent: "#ff9bff",
    trailColor: "rgba(255, 0, 255, 0.45)",
    spawn: { x: Math.floor(GRID_COLS * 0.8), y: Math.floor(GRID_ROWS / 2) },
    direction: { x: -1, y: 0 },
    controls: {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
    },
  },
];

type PlayerId = (typeof playerConfigs)[number]["id"];

const keyString = ({ x, y }: Point) => `${x},${y}`;

const isOpposite = (a: Direction, b: Direction) =>
  a.x === -b.x && a.y === -b.y;

const clonePlayer = (config: PlayerConfig): PlayerRuntime => ({
  ...config,
  position: { ...config.spawn },
  direction: { ...config.direction },
  nextDirection: { ...config.direction },
});

const drawGrid = (ctx: CanvasRenderingContext2D) => {
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#030617");
  gradient.addColorStop(1, "#040b24");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 255, 255, 0.06)";
  for (let x = 0; x <= GRID_COLS; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, CANVAS_HEIGHT);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 0, 255, 0.04)";
  for (let y = 0; y <= GRID_ROWS; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(CANVAS_WIDTH, y * CELL_SIZE);
    ctx.stroke();
  }
};

const clampDirection = (current: Direction, next: Direction) =>
  isOpposite(current, next) ? current : next;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [winner, setWinner] = useState<PlayerId | null>(null);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState<Record<PlayerId, number>>({
    p1: 0,
    p2: 0,
  });

  const playerLegend = useMemo<Record<PlayerId, PlayerConfig>>(
    () => ({
      p1: playerConfigs[0],
      p2: playerConfigs[1],
    }),
    []
  );

  const stopEngine = useCallback(() => {
    if (engineRef.current?.intervalId) {
      window.clearInterval(engineRef.current.intervalId);
      engineRef.current.intervalId = null;
    }
    if (engineRef.current) {
      engineRef.current.running = false;
    }
  }, []);

  const announceWinner = useCallback(
    (id: PlayerId | null) => {
      setWinner(id);
      setStatus("ended");
      stopEngine();
      if (id) {
        setScore((prev) => ({
          ...prev,
          [id]: prev[id] + 1,
        }));
      }
      setRound((prev) => prev + 1);
    },
    [stopEngine]
  );

  const startMatch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    drawGrid(context);

    const players = playerConfigs.map(clonePlayer);
    const trails = new Set<string>(
      players.map((player) => keyString(player.position))
    );

    const engine: GameEngine = {
      ctx: context,
      players,
      trails,
      intervalId: null,
      running: true,
    };

    if (engineRef.current) {
      stopEngine();
    }
    engineRef.current = engine;
    setWinner(null);
    setStatus("running");

    players.forEach((player) => {
      context.fillStyle = player.color;
      const px = player.position.x * CELL_SIZE;
      const py = player.position.y * CELL_SIZE;
      context.fillRect(px, py, CELL_SIZE, CELL_SIZE);
      context.strokeStyle = player.accent;
      context.lineWidth = 2;
      context.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    });

    const step = () => {
      if (!engine.running) return;

      engine.players.forEach((player) => {
        const px = player.position.x * CELL_SIZE;
        const py = player.position.y * CELL_SIZE;
        engine.ctx.fillStyle = player.trailColor;
        engine.ctx.shadowColor = player.accent;
        engine.ctx.shadowBlur = 8;
        engine.ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        engine.ctx.shadowBlur = 0;
        engine.trails.add(keyString(player.position));
      });

      const proposals = engine.players.map((player) => {
        const desired = clampDirection(player.direction, player.nextDirection);
        player.direction = desired;

        const nextPosition = {
          x: player.position.x + desired.x,
          y: player.position.y + desired.y,
        };
        const nextKey = keyString(nextPosition);
        const crashed =
          nextPosition.x < 0 ||
          nextPosition.x >= GRID_COLS ||
          nextPosition.y < 0 ||
          nextPosition.y >= GRID_ROWS ||
          engine.trails.has(nextKey);

        return {
          player,
          nextPosition,
          crashed,
          nextKey,
        };
      });

      const [a, b] = proposals;
      if (!a.crashed && !b.crashed && a.nextKey === b.nextKey) {
        a.crashed = true;
        b.crashed = true;
      }
      const swapped =
        !a.crashed &&
        !b.crashed &&
        a.nextPosition.x === b.player.position.x &&
        a.nextPosition.y === b.player.position.y &&
        b.nextPosition.x === a.player.position.x &&
        b.nextPosition.y === a.player.position.y;
      if (swapped) {
        a.crashed = true;
        b.crashed = true;
      }

      const crashedPlayers = proposals.filter((proposal) => proposal.crashed);

      if (crashedPlayers.length > 0) {
        crashedPlayers.forEach(({ nextPosition, player }) => {
          const cx = Math.min(
            Math.max(nextPosition.x, 0),
            GRID_COLS - 1
          ) * CELL_SIZE;
          const cy = Math.min(
            Math.max(nextPosition.y, 0),
            GRID_ROWS - 1
          ) * CELL_SIZE;
          engine.ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          engine.ctx.shadowColor = player.accent;
          engine.ctx.shadowBlur = 18;
          engine.ctx.beginPath();
          engine.ctx.arc(
            cx + CELL_SIZE / 2,
            cy + CELL_SIZE / 2,
            CELL_SIZE / 1.6,
            0,
            Math.PI * 2
          );
          engine.ctx.fill();
          engine.ctx.shadowBlur = 0;
        });

        const survivors = proposals.filter((proposal) => !proposal.crashed);
        if (survivors.length === 1) {
          announceWinner(survivors[0].player.id);
        } else {
          announceWinner(null);
        }
        return;
      }

      proposals.forEach(({ player, nextPosition }) => {
        player.position = nextPosition;
        const px = nextPosition.x * CELL_SIZE;
        const py = nextPosition.y * CELL_SIZE;
        engine.ctx.fillStyle = player.color;
        engine.ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        engine.ctx.lineWidth = 2;
        engine.ctx.strokeStyle = player.accent;
        engine.ctx.shadowColor = player.accent;
        engine.ctx.shadowBlur = 12;
        engine.ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
        engine.ctx.shadowBlur = 0;
      });
    };

    const intervalId = window.setInterval(step, TICK_MS);
    engine.intervalId = intervalId;
  }, [announceWinner, stopEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    drawGrid(context);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine?.running) return;

      for (const player of engine.players) {
        let next: Direction | null = null;
        if (event.key === player.controls.up) next = { x: 0, y: -1 };
        if (event.key === player.controls.down) next = { x: 0, y: 1 };
        if (event.key === player.controls.left) next = { x: -1, y: 0 };
        if (event.key === player.controls.right) next = { x: 1, y: 0 };
        if (next) {
          event.preventDefault();
          player.nextDirection = clampDirection(player.direction, next);
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      stopEngine();
    };
  }, [stopEngine]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-start gap-8 px-6 py-10 text-sky-50 sm:px-10">
      <header className="flex w-full max-w-5xl flex-col gap-3 text-center sm:text-left">
        <p className="text-xs uppercase tracking-[0.4em] text-sky-400/80">
          Neon Arena
        </p>
        <h1 className="text-3xl font-semibold text-cyan-100 sm:text-4xl">
          Tron Light Cycle Duel
        </h1>
        <p className="text-sm text-sky-200/80 sm:text-base">
          Claim the grid by outmaneuvering your rival. Fill the arena with your
          neon trail and avoid crashing into walls, trails, or each other.
        </p>
      </header>

      <div className="flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-cyan-500/20 bg-[#040917]/80 p-4 shadow-[0_0_40px_rgba(0,255,255,0.08)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
              <div>
                <p className="text-xs uppercase tracking-widest text-cyan-300/70">
                  Player One
                </p>
                <p className="text-lg font-medium text-cyan-100">
                  {playerLegend.p1.name}
                </p>
              </div>
            </div>
            <div className="text-3xl font-semibold text-cyan-200">
              {score.p1}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400" />
              <div>
                <p className="text-xs uppercase tracking-widest text-fuchsia-300/70">
                  Player Two
                </p>
                <p className="text-lg font-medium text-fuchsia-100">
                  {playerLegend.p2.name}
                </p>
              </div>
            </div>
            <div className="text-3xl font-semibold text-fuchsia-200">
              {score.p2}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100/80">
            <div className="font-semibold uppercase tracking-[0.3em] text-cyan-200/80">
              Controls
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-[0.8rem] sm:grid-cols-2">
              <p>
                <span className="text-cyan-200">Photon:</span> W / A / S / D
              </p>
              <p>
                <span className="text-fuchsia-200">Laser:</span> Arrow keys
              </p>
            </div>
          </div>

          <button
            className="mt-auto inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-3 text-sm font-semibold tracking-wide text-cyan-50 transition hover:bg-cyan-400/30 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
            onClick={startMatch}
          >
            {status === "running" ? "Restart Round" : "Start Round"}
          </button>

          <div className="text-[0.7rem] uppercase tracking-[0.4em] text-cyan-100/40">
            Round {round.toString().padStart(2, "0")}
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center">
          <div
            className="w-full max-w-[960px] overflow-hidden rounded-3xl border border-cyan-500/30 bg-black/40 shadow-[0_0_60px_rgba(0,255,255,0.15)] backdrop-blur"
            style={{ aspectRatio: `${GRID_COLS} / ${GRID_ROWS}` }}
          >
            <canvas ref={canvasRef} className="h-full w-full" />
          </div>
          {status === "ended" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-cyan-300/40 bg-black/70 px-8 py-6 text-center shadow-[0_0_50px_rgba(0,0,0,0.4)]">
                <p className="text-xs uppercase tracking-[0.4em] text-sky-200/70">
                  Result
                </p>
                <p className="mt-2 text-2xl font-semibold text-sky-50">
                  {winner
                    ? `${playerLegend[winner].name} wins`
                    : "Head-on collision! Sudden death."}
                </p>
                <p className="mt-3 text-sm text-sky-200/70">
                  Press start for another round.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex w-full max-w-5xl flex-col items-center gap-4 rounded-2xl border border-cyan-500/10 bg-black/40 p-4 text-center text-xs text-sky-200/60 backdrop-blur sm:flex-row sm:justify-between sm:text-left">
        <div>
          Light cycles charge forward at {Math.round(1000 / TICK_MS)} ticks per
          second. Trails are lethal the moment they appear.
        </div>
        <div className="font-semibold text-sky-200/80">
          Stay sharp. Fill the grid.
        </div>
      </footer>
    </div>
  );
}
