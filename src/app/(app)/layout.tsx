import { NavigationHold } from "@/components/NavigationHold";

// Each page checks the session. Doing it here would leave the previous screen clickable until the database answers.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavigationHold />
      {children}
    </>
  );
}
