import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "RosterSync | Find your people", description: "Find a team that shares your skills, schedule and ambition." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
