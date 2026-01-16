import { TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";

interface HeaderProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  availableMonths: string[];
  selectedNation: "domestic" | "export";
  onNationChange: (nation: "domestic" | "export") => void;
}

export function Header({
  selectedMonth,
  onMonthChange,
  availableMonths,
  selectedNation,
  onNationChange,
}: HeaderProps) {
  const formatMonthDisplay = (month: string) => {
    const [year, monthNum] = month.split("-");
    return `${year}년 ${parseInt(monthNum)}월`;
  };

  return (
    <header className="sticky top-0 z-[9999] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">
                급상승 모델 레이더
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                다나와 자동차 판매 분석
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <Select value={selectedMonth} onValueChange={onMonthChange}>
              <SelectTrigger className="w-[140px] sm:w-[160px]" data-testid="select-month">
                <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((month) => (
                  <SelectItem key={month} value={month} data-testid={`option-month-${month}`}>
                    {formatMonthDisplay(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex rounded-md border bg-muted p-1">
              <Button
                variant={selectedNation === "domestic" ? "default" : "ghost"}
                size="sm"
                onClick={() => onNationChange("domestic")}
                className="text-xs sm:text-sm"
                data-testid="button-domestic"
              >
                국산
              </Button>
              <Button
                variant={selectedNation === "export" ? "default" : "ghost"}
                size="sm"
                onClick={() => onNationChange("export")}
                className="text-xs sm:text-sm"
                data-testid="button-export"
              >
                수입
              </Button>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
