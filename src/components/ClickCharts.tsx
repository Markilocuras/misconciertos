import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ClickPoint } from "@/lib/stats.functions";

// Un solo color para las dos series: cada gráfico muestra una sola cosa, así que
// no hay identidad que distinguir por tono. Es el ámbar de la marca bajado a
// oklch L .66, que es donde entra en la banda de luminosidad para fondo oscuro:
// el --primary de la app (L .78) sobre un área grande encandila.
const chartConfig = {
  clicks: { label: "Clics", color: "oklch(0.66 0.17 60)" },
  acumulado: { label: "Acumulado", color: "oklch(0.66 0.17 60)" },
} satisfies ChartConfig;

/** "2026-08-19" → "19/8", para los ticks del eje. */
function diaCorto(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${Number(dia)}/${Number(mes)}`;
}

/** "2026-08-19" → "19 de agosto", para el tooltip. */
function diaLargo(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ComponentProps<typeof ChartContainer>["children"];
}) {
  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </figcaption>
      <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-[220px] w-full">
        {children}
      </ChartContainer>
    </figure>
  );
}

/**
 * Los dos gráficos del panel: el acumulado (cómo viene creciendo el total) y el
 * detalle por día (dónde estuvo el movimiento). Van separados y no en un solo
 * gráfico de dos ejes: dos escalas distintas en un mismo cuadro se leen mal y
 * dan a entender cruces entre las series que no existen.
 */
export function ClickCharts({ series, total }: { series: ClickPoint[]; total: number }) {
  const enLaVentana = series.reduce((acc, d) => acc + d.clicks, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Clics acumulados" subtitle={`Últimos 30 días · ${total} en total`}>
        <AreaChart data={series} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={diaCorto}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={diaLargo} />} />
          <Area
            dataKey="acumulado"
            type="monotone"
            stroke="var(--color-acumulado)"
            strokeWidth={2}
            fill="var(--color-acumulado)"
            fillOpacity={0.18}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ChartCard>

      <ChartCard title="Clics por día" subtitle={`Últimos 30 días · ${enLaVentana} en la ventana`}>
        <BarChart data={series} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={diaCorto}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={diaLargo} />} />
          {/* Sin la animación de entrada las barras no llegan a dibujarse:
              recharts 2 con React 19 deja los grupos vacíos en height 0. */}
          <Bar
            dataKey="clicks"
            fill="var(--color-clicks)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartCard>
    </div>
  );
}
