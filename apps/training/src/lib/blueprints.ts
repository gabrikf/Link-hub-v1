/**
 * The role archetypes every synthetic training example is built from.
 *
 * They are also the vocabulary floor: `blueprintVocabulary()` below is handed to
 * the preprocessing config as reserved slots, so these skills and titles can
 * never be truncated out of the feature space by real data. When they were, the
 * synthetic positives and the synthetic negatives — both built from exactly
 * these terms — encoded as near-identical vectors carrying opposite labels.
 */
export interface TrainingBlueprint {
  headline: string;
  summary: string;
  seniorityLevel: string;
  workModel: string;
  contractType: string;
  location: string;
  spokenLanguages: readonly string[];
  noticePeriod: string;
  openToRelocation: boolean;
  salaryExpectationMin: number;
  salaryExpectationMax: number;
  skills: readonly string[];
  titles: readonly string[];
  minYears: number;
  maxYears: number;
  baseInteraction: number;
  /**
   * Tags the archetype's published posts carry. Without post content on the
   * synthetic side, the v3 post features are identically zero across the whole
   * generated dataset — present in the vector, unlearnable by the model.
   */
  postTags: readonly string[];
}

// A small pool of believable employers so synthetic work history reads like real
// resumes (company + role + accomplishments + stack) instead of empty strings.
export const COMPANY_POOL: readonly string[] = [
  "Nubank",
  "iFood",
  "Mercado Livre",
  "Stone",
  "PagBank",
  "Globo",
  "Loft",
  "QuintoAndar",
  "Wildlife Studios",
  "VTEX",
  "Hotmart",
  "CI&T",
] as const;

export const SYNTHETIC_STACKS: readonly TrainingBlueprint[] = [
  {
    headline: "Senior Node.js Backend Engineer",
    summary: "Designs scalable APIs and distributed systems.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 120000,
    salaryExpectationMax: 180000,
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "Kafka"],
    titles: ["Backend Engineer", "Software Engineer"],
    minYears: 6,
    maxYears: 12,
    baseInteraction: 1.25,
    postTags: ["node.js", "postgresql", "kafka"],
  },
  {
    headline: "React Frontend Engineer",
    summary: "Builds component systems and performant web apps.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "full-time",
    location: "rio de janeiro",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "15 days",
    openToRelocation: false,
    salaryExpectationMin: 90000,
    salaryExpectationMax: 140000,
    skills: ["React", "TypeScript", "Vite", "Tailwind CSS", "Testing Library"],
    titles: ["Frontend Engineer", "React Developer"],
    minYears: 3,
    maxYears: 8,
    baseInteraction: 0.95,
    postTags: ["react", "typescript", "tailwind css"],
  },
  {
    headline: "Fullstack Engineer — React and Node.js",
    summary: "Delivers end-to-end features across web UI and REST APIs.",
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 100000,
    salaryExpectationMax: 160000,
    skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
    titles: ["Fullstack Engineer", "Software Engineer"],
    minYears: 4,
    maxYears: 10,
    baseInteraction: 1.15,
    postTags: ["react", "node.js", "docker"],
  },
  {
    headline: "Senior Fullstack Developer — React and Node.js",
    summary:
      "Leads full-cycle product development from DB schema to UI components.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "belo horizonte",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 130000,
    salaryExpectationMax: 200000,
    skills: [
      "React",
      "Node.js",
      "TypeScript",
      "GraphQL",
      "PostgreSQL",
      "Redis",
    ],
    titles: ["Fullstack Engineer", "Software Engineer", "Tech Lead"],
    minYears: 7,
    maxYears: 14,
    baseInteraction: 1.4,
    postTags: ["react", "graphql", "postgresql"],
  },
  {
    headline: "Python Data Engineer",
    summary: "Creates ETL pipelines and ML-ready datasets.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "contract",
    location: "belo horizonte",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 110000,
    salaryExpectationMax: 170000,
    skills: ["Python", "Apache Airflow", "Apache Spark", "SQL", "AWS"],
    titles: ["Data Engineer", "Python Engineer"],
    minYears: 5,
    maxYears: 11,
    baseInteraction: 1.1,
    postTags: ["python", "apache airflow", "aws"],
  },
  {
    headline: "C# .NET Backend Developer",
    summary: "Builds enterprise APIs and cloud-native services.",
    seniorityLevel: "mid",
    workModel: "on-site",
    contractType: "clt",
    location: "campinas",
    spokenLanguages: ["portuguese", "english"],
    noticePeriod: "45 days",
    openToRelocation: false,
    salaryExpectationMin: 85000,
    salaryExpectationMax: 145000,
    skills: ["C#", ".NET", "SQL Server", "Azure", "Docker"],
    titles: ["Software Engineer", "Backend Developer"],
    minYears: 4,
    maxYears: 10,
    baseInteraction: 0.9,
    postTags: ["c#", ".net", "azure"],
  },
  {
    headline: "Java Platform Engineer",
    summary: "Maintains high-throughput microservices architecture.",
    seniorityLevel: "staff",
    workModel: "hybrid",
    contractType: "pj",
    location: "florianopolis",
    spokenLanguages: ["english"],
    noticePeriod: "60 days",
    openToRelocation: true,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 220000,
    skills: ["Java", "Spring Boot", "Kubernetes", "PostgreSQL", "RabbitMQ"],
    titles: ["Platform Engineer", "Software Architect"],
    minYears: 8,
    maxYears: 16,
    baseInteraction: 1.35,
    postTags: ["java", "spring boot", "kubernetes"],
  },
  {
    headline: "DevOps Engineer",
    summary: "Automates delivery and observability across environments.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "freelance",
    location: "curitiba",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "immediate",
    openToRelocation: true,
    salaryExpectationMin: 115000,
    salaryExpectationMax: 190000,
    skills: ["Docker", "Kubernetes", "Terraform", "AWS", "Prometheus"],
    titles: ["DevOps Engineer", "Site Reliability Engineer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.2,
    postTags: ["terraform", "kubernetes", "prometheus"],
  },
  {
    headline: "Go Backend Engineer",
    summary: "Builds high-performance microservices and CLIs in Go.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "porto alegre",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 125000,
    salaryExpectationMax: 195000,
    skills: ["Go", "gRPC", "PostgreSQL", "Redis", "Kubernetes"],
    titles: ["Backend Engineer", "Software Engineer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.1,
    postTags: ["go", "grpc", "redis"],
  },
  {
    headline: "Mobile Engineer — Flutter",
    summary: "Ships polished cross-platform apps with Flutter and Dart.",
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "recife",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "15 days",
    openToRelocation: false,
    salaryExpectationMin: 85000,
    salaryExpectationMax: 140000,
    skills: ["Flutter", "Dart", "Firebase", "REST API", "BLoC"],
    titles: ["Mobile Engineer", "Flutter Developer"],
    minYears: 3,
    maxYears: 8,
    baseInteraction: 1.0,
    postTags: ["flutter", "dart", "firebase"],
  },
  {
    headline: "Machine Learning Engineer",
    summary: "Trains and deploys ML models for production inference.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "contract",
    location: "sao paulo",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 210000,
    skills: ["Python", "PyTorch", "scikit-learn", "MLflow", "AWS"],
    titles: ["Machine Learning Engineer", "Data Scientist"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.2,
    postTags: ["machine learning", "pytorch", "mlflow"],
  },
  {
    headline: "QA Automation Engineer",
    summary:
      "Designs test frameworks that catch regressions before production.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "clt",
    location: "belo horizonte",
    spokenLanguages: ["english", "portuguese"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 75000,
    salaryExpectationMax: 120000,
    skills: ["Cypress", "Playwright", "TypeScript", "Jest", "CI/CD"],
    titles: ["QA Engineer", "Software Engineer in Test"],
    minYears: 3,
    maxYears: 9,
    baseInteraction: 0.85,
    postTags: ["playwright", "cypress", "ci/cd"],
  },
  // --- Out-of-domain stacks ---
  // These exist so the vocabulary includes their skills and the cross-blueprint
  // negative generator can produce "Fullstack query + iOS candidate = label 0"
  // training examples, teaching the model that zero skill overlap → bad match.
  {
    headline: "Senior Swift iOS Engineer",
    summary:
      "Builds polished native iOS apps with SwiftUI and Core Data integrations.",
    seniorityLevel: "senior",
    workModel: "on-site",
    contractType: "freelance",
    location: "toronto",
    spokenLanguages: ["english"],
    noticePeriod: "60 days",
    openToRelocation: false,
    salaryExpectationMin: 140000,
    salaryExpectationMax: 210000,
    skills: ["Swift", "SwiftUI", "Xcode", "Core Data", "UIKit"],
    titles: ["iOS Developer", "Mobile Engineer"],
    minYears: 7,
    maxYears: 14,
    baseInteraction: 1.1,
    postTags: ["swift", "swiftui", "core data"],
  },
  {
    headline: "Android Kotlin Engineer",
    summary: "Ships robust Android apps with Kotlin and Jetpack Compose.",
    seniorityLevel: "mid",
    workModel: "hybrid",
    contractType: "clt",
    location: "campinas",
    spokenLanguages: ["portuguese", "english"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 90000,
    salaryExpectationMax: 140000,
    skills: ["Kotlin", "Jetpack Compose", "Android SDK", "Room", "Coroutines"],
    titles: ["Android Developer", "Mobile Engineer"],
    minYears: 3,
    maxYears: 9,
    baseInteraction: 0.95,
    postTags: ["kotlin", "jetpack compose", "android sdk"],
  },
  {
    headline: "Elixir Backend Engineer",
    summary:
      "Creates fault-tolerant distributed systems with Elixir and Phoenix.",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "full-time",
    location: "berlin",
    spokenLanguages: ["english", "german"],
    noticePeriod: "30 days",
    openToRelocation: false,
    salaryExpectationMin: 120000,
    salaryExpectationMax: 180000,
    skills: ["Elixir", "Phoenix", "Erlang", "Ecto", "LiveView"],
    titles: ["Backend Engineer", "Elixir Developer"],
    minYears: 5,
    maxYears: 12,
    baseInteraction: 1.05,
    postTags: ["elixir", "phoenix", "liveview"],
  },
] as const;

/**
 * Every term the synthetic data depends on, in the shape
 * `buildPreprocessingVocabulary` reserves slots for.
 */
export function blueprintVocabulary(): {
  locations: string[];
  skills: string[];
  titles: string[];
  languages: string[];
  noticePeriods: string[];
} {
  const unique = (values: string[]) => [...new Set(values)];

  return {
    locations: unique(SYNTHETIC_STACKS.map((stack) => stack.location)),
    skills: unique([
      ...SYNTHETIC_STACKS.flatMap((stack) => [...stack.skills]),
      ...SYNTHETIC_STACKS.flatMap((stack) => [...stack.postTags]),
    ]),
    titles: unique(SYNTHETIC_STACKS.flatMap((stack) => [...stack.titles])),
    languages: unique(
      SYNTHETIC_STACKS.flatMap((stack) => [...stack.spokenLanguages]),
    ),
    noticePeriods: unique(SYNTHETIC_STACKS.map((stack) => stack.noticePeriod)),
  };
}
