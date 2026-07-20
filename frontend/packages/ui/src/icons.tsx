import type { ReactNode, SVGProps } from "react";
import {
  LayoutDashboard,
  Menu,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  Hospital,
  UserRound,
  User,
  Users,
  File,
  FilePlus,
  FileText,
  FileCheck,
  FormInput,
  ClipboardList,
  CreditCard,
  Layers,
  Calendar,
  Mail,
  Check,
  CircleCheck,
  X,
  CircleAlert,
  TriangleAlert,
  Info,
  CircleHelp,
  Minus,
  Dot,
  Ellipsis,
  Clock,
  Sparkles,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Search,
  Download,
  Upload,
  Send,
  Printer,
  RefreshCw,
  Link,
  Signature,
  Settings,
  Globe,
  Key,
  Shield,
  ShieldCheck,
  Fingerprint,
  ScanFace,
  LogOut,
  Ticket,
  Tag,
  ChartColumn,
  GripVertical,
  Star,
  Copy,
  type LucideIcon,
} from "lucide-react";

// The Acuity icon roster - one Lucide line-icon family shared by every surface
// (FINAL.md iconography). Lucide is the canonical open-source hairline set
// (lucide.dev, ISC): 24px grid, geometric line glyphs on currentColor. We tune
// every glyph to the Caliber hairline weight (1.5px stroke) and a 20px default
// box via the `lucide()` wrapper, so the whole set is consistent and
// professionally drawn while the public API is unchanged. Two APIs:
//   - named components (PlusIcon, CheckIcon, ...) for direct use;
//   - the keyed <AcuityIcon name="..."> for data-driven contexts (tables,
//     status metas) where the glyph arrives as a string.
//
// External-service marks (Google, WhatsApp) are NOT Lucide glyphs — they render
// as single-tone monochrome silhouettes from the official simple-icons paths,
// never the provider's own colours.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// Wrap a Lucide icon with the Caliber defaults (20px, 1.5px stroke, decorative).
// Callers still override size / strokeWidth / className freely.
function lucide(Icon: LucideIcon) {
  return function AcuityLucideIcon({
    size = 20,
    strokeWidth = 1.5,
    ...props
  }: IconProps) {
    return (
      <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />
    );
  };
}

// Brand-mark base: a filled single-tone silhouette (fill = currentColor), never
// a stroked line icon — the official simple-icons paths are solid shapes.
function Brand({
  size = 20,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// ---- named icon components --------------------------------------------------
// navigation / layout
export const DashboardIcon = lucide(LayoutDashboard);
export const MenuIcon = lucide(Menu);
export const ChevronRightIcon = lucide(ChevronRight);
export const ChevronDownIcon = lucide(ChevronDown);
export const ChevronUpIcon = lucide(ChevronUp);
export const ArrowLeftIcon = lucide(ArrowLeft);
export const ArrowRightIcon = lucide(ArrowRight);
// entities
export const ClinicIcon = lucide(Hospital);
export const DoctorIcon = lucide(UserRound);
export const UserIcon = lucide(User);
export const UsersIcon = lucide(Users);
export const FileIcon = lucide(File);
export const FilePlusIcon = lucide(FilePlus);
export const TemplateIcon = lucide(FileText);
export const ClaimIcon = lucide(FileCheck);
export const FieldIcon = lucide(FormInput);
export const AuditIcon = lucide(ClipboardList);
export const CardIcon = lucide(CreditCard);
export const LayersIcon = lucide(Layers);
export const CalendarIcon = lucide(Calendar);
export const MailIcon = lucide(Mail);
// status / feedback
export const CheckIcon = lucide(Check);
export const CheckCircleIcon = lucide(CircleCheck);
export const XIcon = lucide(X);
export const AlertIcon = lucide(CircleAlert);
export const AlertTriangleIcon = lucide(TriangleAlert);
export const InfoIcon = lucide(Info);
export const HelpIcon = lucide(CircleHelp);
export const DashIcon = lucide(Minus);
export const DotIcon = lucide(Dot);
export const DotsIcon = lucide(Ellipsis);
export const ClockIcon = lucide(Clock);
export const SparkleIcon = lucide(Sparkles);
export const EyeIcon = lucide(Eye);
// actions
export const PlusIcon = lucide(Plus);
export const PencilIcon = lucide(Pencil);
export const TrashIcon = lucide(Trash2);
export const SearchIcon = lucide(Search);
export const DownloadIcon = lucide(Download);
export const UploadIcon = lucide(Upload);
export const SendIcon = lucide(Send);
export const PrintIcon = lucide(Printer);
export const RetryIcon = lucide(RefreshCw);
export const LinkIcon = lucide(Link);
export const SignIcon = lucide(Signature);
// account / security
export const SettingsIcon = lucide(Settings);
export const GlobeIcon = lucide(Globe);
export const KeyIcon = lucide(Key);
export const ShieldIcon = lucide(Shield);
export const ShieldCheckIcon = lucide(ShieldCheck);
export const FingerprintIcon = lucide(Fingerprint);
export const ScanFaceIcon = lucide(ScanFace);
export const SignOutIcon = lucide(LogOut);
// console supplement (upstreamed from the admin fork)
export const TicketIcon = lucide(Ticket);
export const TagIcon = lucide(Tag);
export const ChartIcon = lucide(ChartColumn);
export const GripIcon = lucide(GripVertical);
export const StarIcon = lucide(Star);
export const CopyIcon = lucide(Copy);

// external-service marks (single-tone monochrome, official simple-icons paths)
export function GoogleGlyph(props: IconProps) {
  return (
    <Brand {...props}>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </Brand>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <Brand {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </Brand>
  );
}

// ---- keyed API (data-driven contexts) --------------------------------------
// The keyed map reuses the wrapped components above, so a string-keyed glyph and
// its named export are guaranteed identical.
const GLYPHS = {
  // navigation / layout
  dashboard: DashboardIcon,
  menu: MenuIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-up": ChevronUpIcon,
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  // entities
  clinic: ClinicIcon,
  doctor: DoctorIcon,
  user: UserIcon,
  users: UsersIcon,
  file: FileIcon,
  "file-plus": FilePlusIcon,
  template: TemplateIcon,
  claim: ClaimIcon,
  field: FieldIcon,
  audit: AuditIcon,
  card: CardIcon,
  layers: LayersIcon,
  calendar: CalendarIcon,
  mail: MailIcon,
  // status / feedback
  check: CheckIcon,
  "check-circle": CheckCircleIcon,
  x: XIcon,
  alert: AlertIcon,
  "alert-triangle": AlertTriangleIcon,
  info: InfoIcon,
  help: HelpIcon,
  dash: DashIcon,
  dot: DotIcon,
  dots: DotsIcon,
  clock: ClockIcon,
  sparkle: SparkleIcon,
  eye: EyeIcon,
  // actions
  plus: PlusIcon,
  pencil: PencilIcon,
  trash: TrashIcon,
  search: SearchIcon,
  download: DownloadIcon,
  upload: UploadIcon,
  send: SendIcon,
  print: PrintIcon,
  retry: RetryIcon,
  link: LinkIcon,
  sign: SignIcon,
  // account / security
  settings: SettingsIcon,
  globe: GlobeIcon,
  key: KeyIcon,
  shield: ShieldIcon,
  "shield-check": ShieldCheckIcon,
  fingerprint: FingerprintIcon,
  "scan-face": ScanFaceIcon,
  "sign-out": SignOutIcon,
  // console supplement
  ticket: TicketIcon,
  tag: TagIcon,
  chart: ChartIcon,
  grip: GripIcon,
  star: StarIcon,
  copy: CopyIcon,
  // external-service marks
  google: GoogleGlyph,
  whatsapp: WhatsAppIcon,
} satisfies Record<string, (props: IconProps) => ReactNode>;

export type AcuityIconName = keyof typeof GLYPHS;

/** Keyed icon for data-driven contexts (status metas, table cells). */
export function AcuityIcon({
  name,
  ...props
}: IconProps & { name: AcuityIconName }) {
  const Glyph = GLYPHS[name];
  return <Glyph {...props} />;
}
