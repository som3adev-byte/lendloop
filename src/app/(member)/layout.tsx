import { MemberGate } from "../providers";

export default function MemberLayout({ children }: LayoutProps<"/">) {
  return <MemberGate>{children}</MemberGate>;
}
