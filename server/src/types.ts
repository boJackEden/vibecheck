export interface QuizOption {
  label: string; // "A" | "B" | "C" | "D"
  text: string;
}

export interface Question {
  id: number;
  question: string;
  options: QuizOption[];
  correct: string; // label of the correct option
  explanation: string;
}

export interface QuizSession {
  repo: string;
  pr: number;
  questions: Question[];
  createdAt: number;
}

export interface QuizConfig {
  difficulty?: "junior" | "mid" | "senior";
  focus?: "logic" | "security" | "performance" | "general";
  passRatio?: number;
}

export interface GradeResult {
  id: number;
  picked: string[];
  correct: boolean;
}

export interface Grade {
  results: GradeResult[];
  score: number;
  total: number;
  passed: boolean;
}
