import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const MIN_LEN = 12;
const MAX_LEN = 24;
const checkLength = (password: string) =>
  password.length >= MIN_LEN && password.length <= MAX_LEN;
const checkUppercase = (password: string) => /[A-Z]/.test(password);
const checkLowercase = (password: string) => /[a-z]/.test(password);
const checkNumber = (password: string) => /[0-9]/.test(password);
const checkSpecialChar = (password: string) => /[^A-Za-z0-9]/.test(password);

function RequirementItem({
  met,
  children,
}: {
  met: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center",
        met ? "text-green-600" : "text-destructive",
      )}
    >
      {met ? (
        <CheckCircle className="mr-2 h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
      )}
      {children}
    </li>
  );
}

interface PasswordRequirementsProps {
  password?: string;
}

export function PasswordRequirements({
  password = "",
}: PasswordRequirementsProps) {
  const isLengthMet = checkLength(password);
  const isUppercaseMet = checkUppercase(password);
  const isLowercaseMet = checkLowercase(password);
  const isNumberMet = checkNumber(password);
  const isSpecialCharMet = checkSpecialChar(password);

  const requirements = [
    { met: isLengthMet, text: `${MIN_LEN}-${MAX_LEN} characters long` },
    { met: isUppercaseMet, text: "At least one uppercase letter" },
    { met: isLowercaseMet, text: "At least one lowercase letter" },
    { met: isNumberMet, text: "At least one number" },
    { met: isSpecialCharMet, text: "At least one special character" },
  ];

  const requirementsMetCount = requirements.filter((r) => r.met).length;

  const getPasswordStrength = () => {
    return (requirementsMetCount / requirements.length) * 100;
  };

  if (password.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Progress value={getPasswordStrength()} className="h-2" />
      <ul className="list-none space-y-1 pt-1 text-xs">
        {requirements.map((req) => (
          <RequirementItem key={req.text} met={req.met}>
            {req.text}
          </RequirementItem>
        ))}
      </ul>
    </div>
  );
}

export const passwordValidation = {
  MIN_LEN,
  MAX_LEN,
  checkLength,
  checkUppercase,
  checkLowercase,
  checkNumber,
  checkSpecialChar,
  checkAll: (password: string) =>
    checkLength(password) &&
    checkUppercase(password) &&
    checkLowercase(password) &&
    checkNumber(password) &&
    checkSpecialChar(password),
};
