import { CalendarPlus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Concert } from "@/data/concerts";

const TZ = "America/Argentina/Buenos_Aires";
const DEFAULT_DURATION_HOURS = 3;

// "2026-08-20" + "21:00" → "20260820T210000" (hora local flotante; el timezone
// va aparte, como TZID/ctz).
function toCalStamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function addHours(date: string, time: string, hours: number): { date: string; time: string } {
  const d = new Date(`${date}T${time}:00`);
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function calendarTitle(c: Concert): string {
  return c.artist && c.artist !== c.title ? `${c.artist} — ${c.title}` : c.title;
}

function googleCalendarUrl(c: Concert): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calendarTitle(c),
    location: c.venue || "Buenos Aires",
    ctz: TZ,
    details: c.buyUrl && c.buyUrl !== "#" ? `Entradas: ${c.buyUrl}` : "",
  });
  if (c.time) {
    const end = addHours(c.date, c.time, DEFAULT_DURATION_HOURS);
    params.set("dates", `${toCalStamp(c.date, c.time)}/${toCalStamp(end.date, end.time)}`);
  } else {
    // Sin hora: evento de día completo (end exclusivo = día siguiente).
    const next = addHours(c.date, "00:00", 24);
    params.set("dates", `${c.date.replace(/-/g, "")}/${next.date.replace(/-/g, "")}`);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsEscape(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildIcs(c: Concert): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//misconciertos//ES"];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${c.id}@misconciertos`);
  if (c.time) {
    const end = addHours(c.date, c.time, DEFAULT_DURATION_HOURS);
    lines.push(`DTSTART;TZID=${TZ}:${toCalStamp(c.date, c.time)}`);
    lines.push(`DTEND;TZID=${TZ}:${toCalStamp(end.date, end.time)}`);
  } else {
    const next = addHours(c.date, "00:00", 24);
    lines.push(`DTSTART;VALUE=DATE:${c.date.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${next.date.replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${icsEscape(calendarTitle(c))}`);
  lines.push(`LOCATION:${icsEscape(c.venue || "Buenos Aires")}`);
  if (c.buyUrl && c.buyUrl !== "#") {
    lines.push(`DESCRIPTION:${icsEscape(`Entradas: ${c.buyUrl}`)}`);
    lines.push(`URL:${c.buyUrl}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function AddToCalendar({ concert }: { concert: Concert }) {
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(concert)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${concert.slug || "concierto"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a
          href={googleCalendarUrl(concert)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
          Google Calendar
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={downloadIcs}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        .ics
      </Button>
    </div>
  );
}
