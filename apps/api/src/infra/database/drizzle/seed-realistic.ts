import "reflect-metadata";
import "dotenv/config";
import { setupContainer, TOKENS, resolve } from "../../di/container.js";
import { seedDefaultCatalog } from "./seed.js";
import {
  DEFAULT_SKILLS,
  DEFAULT_TITLES,
  normalizeCatalogName,
} from "./seed-catalog-data.js";
import { CreateUserUseCase } from "../../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { UpsertMyResumeUseCase } from "../../../core/use-case/resumes/upsert-my-resume-use-case/upsert-my-resume.use-case.js";
import { SaveResumeSkillsBulkUseCase } from "../../../core/use-case/resumes/save-resume-skills-bulk-use-case/save-resume-skills-bulk.use-case.js";
import { SaveResumeTitlesBulkUseCase } from "../../../core/use-case/resumes/save-resume-titles-bulk-use-case/save-resume-titles-bulk.use-case.js";
import { RecordCandidateInteractionUseCase } from "../../../core/use-case/interactions/record-candidate-interaction-use-case/record-candidate-interaction.use-case.js";
import { ProcessResumeEmbeddingJobUseCase } from "../../../core/use-case/resumes/process-resume-embedding-job-use-case/process-resume-embedding-job.use-case.js";
import { IUsersRepository } from "../../../core/repositories/user/user-repository.js";
import { IResumesRepository } from "../../../core/repositories/resume/resume-repository.js";
import { ISkillCatalogRepository } from "../../../core/repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../../core/repositories/title-catalog/title-catalog-repository.js";
import { IResumeSkillRepository } from "../../../core/repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../core/repositories/resume-title/resume-title-repository.js";
import { IResumeEmbeddingsRepository } from "../../../core/repositories/resume-embedding/resume-embedding-repository.js";
import { IEmbeddingProvider } from "../../../core/providers/embedding/embedding-provider.js";

type CandidateSeed = {
  name: string;
  email: string;
  login: string;
  password: string;
  headlineTitle: string;
  summary: string;
  totalYearsExperience: number;
  seniorityLevel: string;
  workModel: string;
  contractType: string;
  location: string;
  spokenLanguages: string[];
  noticePeriod: string;
  openToRelocation: boolean;
  salaryExpectationMin: number;
  salaryExpectationMax: number;
  skills: string[];
  titles: string[];
  interactionBase: number;
};

type CandidateBlueprint = {
  slug: string;
  baseLabel: string;
  mainLanguage: string;
  summary: string;
  coreTitles: string[];
  salaryMin: number;
  salaryMax: number;
  yearsBase: number;
  seniority: string;
  workModels: string[];
  contractTypes: string[];
  requiredSkills: string[];
  frameworkSkills: string[];
  architectureSkills: string[];
  cloudSkills: string[];
  dataSkills: string[];
  testingSkills: string[];
};

const RECRUITER_SEED = {
  name: "LinkHub Recruiter",
  email: "recruiter.seed@linkhub.local",
  login: "recruiter-seed",
  password: "12345678",
};

const DEFAULT_CANDIDATE_COUNT = 300;

const LOCATIONS = [
  "sao paulo",
  "rio de janeiro",
  "belo horizonte",
  "curitiba",
  "porto alegre",
  "recife",
  "fortaleza",
  "florianopolis",
  "campinas",
  "goiania",
  "salvador",
  "brasilia",
  "lisbon",
  "porto",
  "madrid",
  "barcelona",
  "mexico city",
  "bogota",
  "buenos aires",
  "montevideo",
  "santiago",
  "medellin",
  "london",
  "berlin",
  "amsterdam",
  "dublin",
  "toronto",
  "vancouver",
  "new york",
  "austin",
  "miami",
  "warsaw",
  "prague",
  "tel aviv",
  "bangalore",
  "singapore",
  "tokyo",
  "sydney",
  "melbourne",
  "cape town",
];

const LANGUAGE_PROFILES: string[][] = [
  ["english"],
  ["portuguese"],
  ["spanish"],
  ["english", "portuguese"],
  ["english", "spanish"],
  ["portuguese", "spanish"],
  ["english", "portuguese", "spanish"],
  ["english", "german"],
  ["english", "french"],
  ["english", "japanese"],
  ["english", "italian"],
  ["english", "portuguese", "french"],
];

const NOTICE_PERIODS = [
  "immediate",
  "15 days",
  "30 days",
  "45 days",
  "60 days",
];

const EXTRA_TITLE_POOL = [
  "API Engineer",
  "Search Engineer",
  "Platform Engineer",
  "Technical Consultant",
  "Infrastructure Engineer",
  "Security Engineer",
  "Automation Engineer",
  "Data Platform Engineer",
  "Observability Engineer",
  "Solutions Architect",
  "Software Architect",
  "Staff Engineer",
  "Principal Engineer",
  "Tech Lead",
];

const CROSS_STACK_SKILLS = [
  "GraphQL",
  "REST API",
  "OpenAPI",
  "CI/CD",
  "GitHub Actions",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Linux",
  "Bash",
  "Redis",
  "Kafka",
  "RabbitMQ",
  "OpenTelemetry",
  "Prometheus",
  "Grafana",
  "Sentry",
  "Microservices",
  "Clean Architecture",
  "DDD",
  "CQRS",
  "Event-Driven Architecture",
  "TDD",
  "OWASP",
  "Performance Tuning",
  "Load Testing",
  "Accessibility",
  "Design Systems",
  "Storybook",
  "Feature Flags",
  "Cloudflare",
  "Prisma",
  "Drizzle ORM",
  "TypeORM",
  "Serverless",
  "AWS Lambda",
  "Cloud Run",
  "MLOps",
  "RAG",
  "Vector Databases",
];

const CANDIDATE_BLUEPRINTS: CandidateBlueprint[] = [
  {
    slug: "javascript-fullstack",
    baseLabel: "JavaScript Fullstack",
    mainLanguage: "JavaScript",
    summary:
      "Delivers end-to-end features with versatile JavaScript skills across the stack.",
    coreTitles: [
      "Full Stack Engineer",
      "Software Engineer",
      "JavaScript Developer",
    ],
    salaryMin: 75000,
    salaryMax: 160000,
    yearsBase: 5,
    seniority: "mid",
    workModels: ["remote", "hybrid", "on-site"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["JavaScript", "TypeScript", "React", "Node.js", "AWS"],
    frameworkSkills: [
      "Next.js",
      "Express",
      "GraphQL",
      "Apollo",
      "Socket.IO",
      "Tailwind CSS",
      "React-hook-form",
      "zod",
      "Prisma",
      "Drizzle ORM",
      "TypeORM",
    ],
    architectureSkills: [
      "Monolith",
      "Microservices",
      "Clean Architecture",
      "SOLID",
      "Event-Driven Architecture",
    ],
    cloudSkills: [
      "AWS",
      "Docker",
      "Kubernetes",
      "GitHub Actions",
      "Cloudflare",
    ],
    dataSkills: ["PostgreSQL", "MongoDB", "Redis", "ElasticSearch"],
    testingSkills: [
      "Jest",
      "Vitest",
      "Testing Library",
      "Cypress",
      "Playwright",
      "Contract Testing",
      "Load Testing",
    ],
  },
  {
    slug: "node-backend",
    baseLabel: "Node Backend",
    mainLanguage: "TypeScript",
    summary:
      "Builds high-throughput APIs with event-driven pipelines and observability-first culture.",
    coreTitles: ["Backend Engineer", "Node.js Engineer", "Software Engineer"],
    salaryMin: 95000,
    salaryMax: 190000,
    yearsBase: 7,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "pj"],
    requiredSkills: ["TypeScript", "Node.js", "PostgreSQL", "Redis"],
    frameworkSkills: [
      "Fastify",
      "NestJS",
      "Express",
      "GraphQL",
      "Apollo",
      "Socket.IO",
    ],
    architectureSkills: [
      "Microservices",
      "DDD",
      "CQRS",
      "Hexagonal Architecture",
      "Clean Architecture",
    ],
    cloudSkills: ["AWS", "Docker", "Kubernetes", "Terraform", "OpenTelemetry"],
    dataSkills: ["Kafka", "RabbitMQ", "ElasticSearch", "ClickHouse"],
    testingSkills: ["Vitest", "Jest", "k6", "Contract Testing", "Playwright"],
  },
  {
    slug: "react-frontend",
    baseLabel: "React Frontend",
    mainLanguage: "TypeScript",
    summary:
      "Ships polished web experiences with strong accessibility and scalable design systems.",
    coreTitles: ["Frontend Engineer", "React Developer", "Software Engineer"],
    salaryMin: 80000,
    salaryMax: 165000,
    yearsBase: 6,
    seniority: "mid",
    workModels: ["remote", "hybrid", "on-site"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["TypeScript", "React", "HTML5", "CSS3"],
    frameworkSkills: [
      "Next.js",
      "Vite",
      "Redux",
      "Zustand",
      "TanStack Query",
      "Styled Components",
    ],
    architectureSkills: [
      "Design Systems",
      "Accessibility",
      "Internationalization",
      "SOLID",
    ],
    cloudSkills: ["Cloudflare", "AWS", "CI/CD", "GitHub Actions"],
    dataSkills: ["Product Analytics", "Amplitude", "Segment"],
    testingSkills: [
      "Testing Library",
      "Vitest",
      "Cypress",
      "Playwright",
      "Storybook",
    ],
  },
  {
    slug: "python-data",
    baseLabel: "Python Data",
    mainLanguage: "Python",
    summary:
      "Builds resilient data products from ingestion pipelines to feature stores and ML workloads.",
    coreTitles: [
      "Data Engineer",
      "Python Engineer",
      "Machine Learning Engineer",
    ],
    salaryMin: 90000,
    salaryMax: 200000,
    yearsBase: 8,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "contract", "freelance"],
    requiredSkills: ["Python", "SQL", "Pandas", "PostgreSQL"],
    frameworkSkills: ["FastAPI", "Django", "Airflow", "dbt", "Spark", "MLflow"],
    architectureSkills: [
      "Event-Driven Architecture",
      "MLOps",
      "Data Contracts",
      "Clean Architecture",
    ],
    cloudSkills: [
      "AWS",
      "Google Cloud",
      "Terraform",
      "Kubernetes",
      "Cloud Run",
    ],
    dataSkills: ["BigQuery", "Snowflake", "Redshift", "ClickHouse", "Trino"],
    testingSkills: ["PyTest", "TDD", "Contract Testing", "Load Testing"],
  },
  {
    slug: "dotnet-enterprise",
    baseLabel: "DotNet Enterprise",
    mainLanguage: "C#",
    summary:
      "Delivers enterprise services with clean boundaries, secure APIs, and reliable release cycles.",
    coreTitles: [".NET Engineer", "Backend Engineer", "Software Architect"],
    salaryMin: 85000,
    salaryMax: 180000,
    yearsBase: 7,
    seniority: "mid",
    workModels: ["hybrid", "on-site", "remote"],
    contractTypes: ["clt", "full-time", "pj"],
    requiredSkills: ["C#", ".NET", "ASP.NET Core", "SQL Server"],
    frameworkSkills: [
      "Entity Framework",
      "MediatR",
      "gRPC",
      "OpenAPI",
      "Redis",
    ],
    architectureSkills: ["DDD", "CQRS", "Hexagonal Architecture", "OWASP"],
    cloudSkills: ["Azure", "Docker", "Kubernetes", "GitHub Actions"],
    dataSkills: ["MongoDB", "ElasticSearch", "RabbitMQ"],
    testingSkills: ["xUnit", "NUnit", "TDD", "k6"],
  },
  {
    slug: "java-platform",
    baseLabel: "Java Platform",
    mainLanguage: "Java",
    summary:
      "Operates mission-critical services with performance tuning and resilient distributed patterns.",
    coreTitles: ["Java Engineer", "Platform Engineer", "Software Architect"],
    salaryMin: 100000,
    salaryMax: 220000,
    yearsBase: 10,
    seniority: "staff",
    workModels: ["hybrid", "remote"],
    contractTypes: ["full-time", "pj"],
    requiredSkills: ["Java", "Spring Boot", "PostgreSQL", "Kafka"],
    frameworkSkills: [
      "Spring Cloud",
      "Hibernate",
      "Micronaut",
      "Quarkus",
      "gRPC",
    ],
    architectureSkills: [
      "Microservices",
      "Event Sourcing",
      "DDD",
      "Performance Tuning",
    ],
    cloudSkills: ["AWS", "Kubernetes", "Terraform", "Prometheus", "Grafana"],
    dataSkills: ["Cassandra", "Redis", "ElasticSearch"],
    testingSkills: ["JUnit", "Contract Testing", "Load Testing", "k6"],
  },
  {
    slug: "go-sre",
    baseLabel: "Go SRE",
    mainLanguage: "Go",
    summary:
      "Keeps production systems fast and stable with deep automation and reliability engineering.",
    coreTitles: ["Site Reliability Engineer", "DevOps Engineer", "Go Engineer"],
    salaryMin: 95000,
    salaryMax: 210000,
    yearsBase: 8,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "freelance", "contract"],
    requiredSkills: ["Go", "Linux", "Docker", "Kubernetes"],
    frameworkSkills: ["Gin", "Fiber", "gRPC", "NATS", "Prometheus"],
    architectureSkills: [
      "Infrastructure as Code",
      "Disaster Recovery",
      "High Availability",
      "SLO/SLI",
    ],
    cloudSkills: ["AWS", "Google Cloud", "Terraform", "Helm", "ArgoCD"],
    dataSkills: ["Redis", "PostgreSQL", "OpenSearch"],
    testingSkills: ["Load Testing", "k6", "Chaos Engineering", "BDD"],
  },
  {
    slug: "rust-systems",
    baseLabel: "Rust Systems",
    mainLanguage: "Rust",
    summary:
      "Builds high-performance infrastructure components with memory-safe concurrent design.",
    coreTitles: ["Rust Engineer", "Systems Engineer", "Platform Engineer"],
    salaryMin: 105000,
    salaryMax: 230000,
    yearsBase: 9,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["Rust", "Tokio", "Linux", "PostgreSQL"],
    frameworkSkills: ["Actix", "Axum", "gRPC", "WebSockets", "OpenTelemetry"],
    architectureSkills: [
      "Event-Driven Architecture",
      "Hexagonal Architecture",
      "Performance Tuning",
    ],
    cloudSkills: ["AWS", "Cloud Run", "Docker", "Kubernetes"],
    dataSkills: ["Redis", "Kafka", "ClickHouse"],
    testingSkills: ["Property Testing", "Load Testing", "Contract Testing"],
  },
  {
    slug: "php-product",
    baseLabel: "PHP Product",
    mainLanguage: "PHP",
    summary:
      "Owns product-centric web platforms with pragmatic architecture and delivery speed.",
    coreTitles: ["PHP Developer", "Full Stack Engineer", "Backend Engineer"],
    salaryMin: 65000,
    salaryMax: 145000,
    yearsBase: 6,
    seniority: "mid",
    workModels: ["remote", "on-site", "hybrid"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["PHP", "Laravel", "MySQL", "Redis"],
    frameworkSkills: ["Symfony", "WordPress", "Vue.js", "REST API", "OpenAPI"],
    architectureSkills: ["Monolith", "Modular Monolith", "Clean Architecture"],
    cloudSkills: ["AWS", "Docker", "NGINX", "CI/CD"],
    dataSkills: ["ElasticSearch", "RabbitMQ", "MariaDB"],
    testingSkills: ["PHPUnit", "BDD", "Selenium", "Cypress"],
  },
  {
    slug: "ruby-rails",
    baseLabel: "Ruby Rails",
    mainLanguage: "Ruby",
    summary:
      "Delivers reliable SaaS features fast while balancing product quality and maintainability.",
    coreTitles: ["Ruby Developer", "Backend Engineer", "Full Stack Engineer"],
    salaryMin: 80000,
    salaryMax: 170000,
    yearsBase: 7,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "freelance"],
    requiredSkills: ["Ruby", "Ruby on Rails", "PostgreSQL", "Redis"],
    frameworkSkills: ["GraphQL", "Sidekiq", "React", "Hotwire", "REST API"],
    architectureSkills: ["Monolith", "Clean Architecture", "SOLID"],
    cloudSkills: ["AWS", "Docker", "GitHub Actions", "Datadog"],
    dataSkills: ["ElasticSearch", "ClickHouse", "Snowflake"],
    testingSkills: ["RSpec", "Capybara", "TDD", "Contract Testing"],
  },
  {
    slug: "kotlin-mobile",
    baseLabel: "Kotlin Mobile",
    mainLanguage: "Kotlin",
    summary:
      "Builds native Android products and shared services with strong release and quality practices.",
    coreTitles: ["Android Engineer", "Mobile Engineer", "Kotlin Developer"],
    salaryMin: 85000,
    salaryMax: 175000,
    yearsBase: 6,
    seniority: "mid",
    workModels: ["remote", "hybrid", "on-site"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["Kotlin", "Jetpack Compose", "Android", "CI/CD"],
    frameworkSkills: ["Ktor", "GraphQL", "Firebase", "REST API", "SQLite"],
    architectureSkills: ["Clean Architecture", "MVVM", "Modular Monolith"],
    cloudSkills: ["Google Cloud", "Cloud Run", "GitHub Actions"],
    dataSkills: ["PostgreSQL", "BigQuery", "Redis"],
    testingSkills: ["JUnit", "Espresso", "Detox", "TDD"],
  },
  {
    slug: "swift-ios",
    baseLabel: "Swift iOS",
    mainLanguage: "Swift",
    summary:
      "Creates polished iOS applications with performance tuning and robust integration patterns.",
    coreTitles: ["iOS Engineer", "Mobile Engineer", "Swift Developer"],
    salaryMin: 90000,
    salaryMax: 185000,
    yearsBase: 7,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "contract", "freelance"],
    requiredSkills: ["Swift", "SwiftUI", "iOS", "REST API"],
    frameworkSkills: ["Combine", "GraphQL", "Firebase", "Realm", "SQLite"],
    architectureSkills: ["Clean Architecture", "MVVM", "Accessibility"],
    cloudSkills: ["AWS", "Cloudflare", "CI/CD"],
    dataSkills: ["PostgreSQL", "MongoDB", "Redis"],
    testingSkills: ["XCTest", "Snapshot Testing", "BDD", "TDD"],
  },
  {
    slug: "scala-streaming",
    baseLabel: "Scala Streaming",
    mainLanguage: "Scala",
    summary:
      "Designs low-latency streaming systems for analytics and real-time decisioning platforms.",
    coreTitles: [
      "Data Platform Engineer",
      "Scala Engineer",
      "Software Architect",
    ],
    salaryMin: 110000,
    salaryMax: 230000,
    yearsBase: 10,
    seniority: "staff",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "pj"],
    requiredSkills: ["Scala", "Akka", "Kafka", "PostgreSQL"],
    frameworkSkills: ["Spark", "Flink", "gRPC", "REST API", "OpenAPI"],
    architectureSkills: ["Event Sourcing", "CQRS", "DDD", "Performance Tuning"],
    cloudSkills: ["AWS", "Kubernetes", "Terraform", "Prometheus"],
    dataSkills: ["Cassandra", "ClickHouse", "Trino", "Snowflake"],
    testingSkills: ["Load Testing", "k6", "Contract Testing", "TDD"],
  },
  {
    slug: "elixir-realtime",
    baseLabel: "Elixir Realtime",
    mainLanguage: "Elixir",
    summary:
      "Builds realtime collaboration products with fault tolerance and high fan-out messaging.",
    coreTitles: ["Elixir Developer", "Backend Engineer", "Platform Engineer"],
    salaryMin: 90000,
    salaryMax: 190000,
    yearsBase: 8,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "freelance"],
    requiredSkills: ["Elixir", "Phoenix", "PostgreSQL", "Redis"],
    frameworkSkills: [
      "WebSockets",
      "GraphQL",
      "RabbitMQ",
      "OpenTelemetry",
      "NATS",
    ],
    architectureSkills: [
      "Event-Driven Architecture",
      "High Availability",
      "Clean Architecture",
    ],
    cloudSkills: ["AWS", "Docker", "Kubernetes", "Datadog"],
    dataSkills: ["ClickHouse", "ElasticSearch", "MongoDB"],
    testingSkills: [
      "Property Testing",
      "BDD",
      "Contract Testing",
      "Load Testing",
    ],
  },
  {
    slug: "qa-automation",
    baseLabel: "QA Automation",
    mainLanguage: "JavaScript",
    summary:
      "Improves release confidence through robust automation, observability, and quality gates.",
    coreTitles: ["QA Engineer", "Automation Engineer", "Software Engineer"],
    salaryMin: 65000,
    salaryMax: 150000,
    yearsBase: 6,
    seniority: "mid",
    workModels: ["remote", "hybrid", "on-site"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["JavaScript", "TypeScript", "Cypress", "Playwright"],
    frameworkSkills: ["Selenium", "Pact", "k6", "Jest", "Vitest"],
    architectureSkills: ["TDD", "BDD", "Contract Testing", "Quality Gates"],
    cloudSkills: ["CI/CD", "GitHub Actions", "Jenkins", "Docker"],
    dataSkills: ["PostgreSQL", "Redis", "ElasticSearch"],
    testingSkills: ["Load Testing", "Performance Tuning", "OWASP"],
  },
  {
    slug: "security-appsec",
    baseLabel: "Security AppSec",
    mainLanguage: "Python",
    summary:
      "Hardens application stacks with secure-by-default patterns, detection pipelines, and threat modeling.",
    coreTitles: [
      "Security Engineer",
      "Application Security Engineer",
      "Software Architect",
    ],
    salaryMin: 95000,
    salaryMax: 210000,
    yearsBase: 9,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["Python", "OWASP", "Linux", "Docker"],
    frameworkSkills: ["FastAPI", "SAST", "DAST", "OAuth2", "Keycloak"],
    architectureSkills: ["Zero Trust", "Threat Modeling", "Clean Architecture"],
    cloudSkills: ["AWS", "Azure", "Terraform", "Kubernetes"],
    dataSkills: ["ElasticSearch", "OpenSearch", "PostgreSQL"],
    testingSkills: ["Penetration Testing", "Load Testing", "Contract Testing"],
  },
  {
    slug: "ai-rag",
    baseLabel: "AI RAG",
    mainLanguage: "Python",
    summary:
      "Builds LLM products with retrieval pipelines, evaluation loops, and production-ready MLOps.",
    coreTitles: ["AI Engineer", "Machine Learning Engineer", "NLP Engineer"],
    salaryMin: 100000,
    salaryMax: 240000,
    yearsBase: 8,
    seniority: "senior",
    workModels: ["remote", "hybrid"],
    contractTypes: ["full-time", "contract", "pj"],
    requiredSkills: ["Python", "LangChain", "RAG", "Vector Databases"],
    frameworkSkills: ["PyTorch", "TensorFlow", "FAISS", "Pinecone", "Weaviate"],
    architectureSkills: [
      "MLOps",
      "Evaluation Pipelines",
      "Prompt Engineering",
      "Event-Driven Architecture",
    ],
    cloudSkills: ["AWS", "Google Cloud", "Cloud Run", "Kubernetes"],
    dataSkills: ["BigQuery", "Snowflake", "PostgreSQL", "Redis"],
    testingSkills: ["A/B Testing", "Contract Testing", "Load Testing"],
  },
  {
    slug: "bi-analytics",
    baseLabel: "BI Analytics",
    mainLanguage: "SQL",
    summary:
      "Turns business data into decision-ready products with modeling governance and semantic layers.",
    coreTitles: ["Analytics Engineer", "BI Engineer", "Data Engineer"],
    salaryMin: 70000,
    salaryMax: 165000,
    yearsBase: 6,
    seniority: "mid",
    workModels: ["remote", "hybrid", "on-site"],
    contractTypes: ["full-time", "contract"],
    requiredSkills: ["SQL", "dbt", "Power BI", "Tableau"],
    frameworkSkills: ["Looker", "BigQuery", "Snowflake", "Redshift", "Trino"],
    architectureSkills: ["Data Governance", "Data Modeling", "Semantic Layer"],
    cloudSkills: ["AWS", "Azure", "Google Cloud", "CI/CD"],
    dataSkills: ["PostgreSQL", "ClickHouse", "MongoDB"],
    testingSkills: ["Data Quality Testing", "Contract Testing", "TDD"],
  },
  {
    slug: "cpp-embedded",
    baseLabel: "C++ Embedded",
    mainLanguage: "C++",
    summary:
      "Develops low-level software for embedded and edge environments with strict performance goals.",
    coreTitles: ["Embedded Engineer", "Systems Engineer", "Software Engineer"],
    salaryMin: 90000,
    salaryMax: 200000,
    yearsBase: 9,
    seniority: "senior",
    workModels: ["on-site", "hybrid", "remote"],
    contractTypes: ["full-time", "contract", "pj"],
    requiredSkills: ["C++", "Linux", "Performance Tuning", "Load Testing"],
    frameworkSkills: ["Qt", "Boost", "gRPC", "OpenTelemetry", "Rust"],
    architectureSkills: [
      "Real-Time Systems",
      "Event-Driven Architecture",
      "High Availability",
    ],
    cloudSkills: ["AWS", "Azure", "Docker", "Kubernetes"],
    dataSkills: ["PostgreSQL", "Redis", "Kafka"],
    testingSkills: ["Hardware-in-the-loop", "BDD", "TDD"],
  },
];

function parseCandidateCount(): number {
  const countArg = process.argv.find((arg) => arg.startsWith("--count="));
  const parsed = Number(countArg?.split("=")[1] ?? DEFAULT_CANDIDATE_COUNT);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CANDIDATE_COUNT;
  }

  return Math.floor(parsed);
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function hashSeed(input: string): number {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pickOne<T>(items: readonly T[], seed: string): T {
  const index = hashSeed(seed) % items.length;
  return items[index]!;
}

function pickManyUnique<T>(
  items: readonly T[],
  amount: number,
  seed: string,
): T[] {
  const uniqueItems = [...new Set(items)];
  if (uniqueItems.length <= amount) {
    return uniqueItems;
  }

  const selected = new Set<T>();
  let salt = 0;

  while (selected.size < amount) {
    const index = hashSeed(`${seed}-${salt}`) % uniqueItems.length;
    selected.add(uniqueItems[index]!);
    salt += 1;
  }

  return [...selected];
}

function normalizeWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildCandidateSeeds(count: number): CandidateSeed[] {
  const candidates: CandidateSeed[] = [];
  const signatures = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const blueprint =
      CANDIDATE_BLUEPRINTS[index % CANDIDATE_BLUEPRINTS.length]!;
    const sequence = index + 1;

    let attempt = 0;
    while (true) {
      const seedBase = `${blueprint.slug}-${sequence}-${attempt}`;
      const minExtra = 6;
      const maxExtra = 10;
      const extraCount =
        minExtra + (hashSeed(seedBase) % (maxExtra - minExtra + 1));
      const extraSkills = pickManyUnique(
        [
          ...blueprint.frameworkSkills,
          ...blueprint.architectureSkills,
          ...blueprint.cloudSkills,
          ...blueprint.dataSkills,
          ...blueprint.testingSkills,
          ...CROSS_STACK_SKILLS,
          ...DEFAULT_SKILLS,
        ],
        extraCount,
        seedBase,
      );

      const multiLanguage = hashSeed(`${seedBase}-lang`) % 4 === 0;
      const secondaryLanguageSkills = multiLanguage
        ? pickManyUnique(
            [
              "Java",
              "Go",
              "Python",
              "TypeScript",
              "Rust",
              "Kotlin",
              "C#",
              "Scala",
            ],
            1 + (hashSeed(`${seedBase}-lang-count`) % 2),
            `${seedBase}-language-extra`,
          )
        : [];

      const skills = [
        ...new Set([
          ...blueprint.requiredSkills,
          ...extraSkills,
          ...secondaryLanguageSkills,
        ]),
      ].slice(0, 14);
      const primaryTitle = pickOne(
        blueprint.coreTitles,
        `${seedBase}-title-primary`,
      );
      const secondaryTitles = pickManyUnique(
        [...EXTRA_TITLE_POOL, ...DEFAULT_TITLES],
        1 + (hashSeed(`${seedBase}-title-count`) % 2),
        `${seedBase}-title-extra`,
      );
      const titles = [...new Set([primaryTitle, ...secondaryTitles])];

      const signature = `${blueprint.slug}|${skills.sort().join("|")}|${titles.join("|")}`;
      if (signatures.has(signature)) {
        attempt += 1;
        continue;
      }

      signatures.add(signature);

      const location = pickOne(LOCATIONS, `${seedBase}-location`);
      const languageProfile = pickOne(LANGUAGE_PROFILES, `${seedBase}-spoken`);

      candidates.push({
        name: `${blueprint.baseLabel} Candidate ${pad(sequence)}`,
        email: `seed.${normalizeWords(blueprint.slug)}.${pad(sequence)}@linkhub.local`,
        login: `seed-${normalizeWords(blueprint.slug)}-${pad(sequence)}`,
        password: "12345678",
        headlineTitle: primaryTitle,
        summary: blueprint.summary,
        totalYearsExperience: Math.max(
          1,
          blueprint.yearsBase + randomInt(-2, 3),
        ),
        seniorityLevel: blueprint.seniority,
        workModel: pickOne(blueprint.workModels, `${seedBase}-work-model`),
        contractType: pickOne(blueprint.contractTypes, `${seedBase}-contract`),
        location,
        spokenLanguages: languageProfile,
        noticePeriod: pickOne(NOTICE_PERIODS, `${seedBase}-notice`),
        openToRelocation: hashSeed(`${seedBase}-relocation`) % 3 !== 0,
        salaryExpectationMin: Math.max(
          40000,
          blueprint.salaryMin + randomInt(-12000, 8000),
        ),
        salaryExpectationMax: Math.max(
          blueprint.salaryMin + 20000,
          blueprint.salaryMax + randomInt(-15000, 18000),
        ),
        skills,
        titles,
        interactionBase: 0.8 + (hashSeed(`${seedBase}-engagement`) % 80) / 100,
      });
      break;
    }
  }

  return candidates;
}

class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  async createEmbedding(text: string): Promise<number[]> {
    const size = 1536;
    const vector = new Array<number>(size).fill(0);
    const normalized = text.trim().toLowerCase();

    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      const bucket = index % size;
      vector[bucket] += (code % 89) / 89;
    }

    let sumSquares = 0;
    for (const value of vector) {
      sumSquares += value * value;
    }

    const magnitude = Math.sqrt(sumSquares) || 1;

    return vector.map((value) => value / magnitude);
  }
}

const skillIdCache = new Map<string, string>();
const titleIdCache = new Map<string, string>();

async function ensureUser(params: {
  name: string;
  email: string;
  login: string;
  password: string;
}): Promise<string> {
  const usersRepository = resolve<IUsersRepository>(TOKENS.UsersRepository);
  const createUserUseCase = resolve<CreateUserUseCase>(
    TOKENS.CreateUserUseCase,
  );

  const existing = await usersRepository.findByEmail(params.email);

  if (existing) {
    return existing.id;
  }

  const created = await createUserUseCase.execute({
    name: params.name,
    email: params.email,
    login: params.login,
    password: params.password,
    description: "Synthetic profile for AI search and rerank tests",
    avatarUrl: null,
  });

  return created.user.id;
}

async function ensureSkillId(name: string): Promise<string> {
  const normalizedName = normalizeCatalogName(name);
  const cached = skillIdCache.get(normalizedName);
  if (cached) {
    return cached;
  }

  const repository = resolve<ISkillCatalogRepository>(
    TOKENS.SkillCatalogRepository,
  );
  const existing = await repository.findByNormalizedName(normalizedName);

  if (existing) {
    skillIdCache.set(normalizedName, existing.id);
    return existing.id;
  }

  const created = await repository.create({
    name,
    normalizedName,
    isDefault: true,
    createdByUserId: null,
  });

  skillIdCache.set(normalizedName, created.id);
  return created.id;
}

async function ensureTitleId(name: string): Promise<string> {
  const normalizedName = normalizeCatalogName(name);
  const cached = titleIdCache.get(normalizedName);
  if (cached) {
    return cached;
  }

  const repository = resolve<ITitleCatalogRepository>(
    TOKENS.TitleCatalogRepository,
  );
  const existing = await repository.findByNormalizedName(normalizedName);

  if (existing) {
    titleIdCache.set(normalizedName, existing.id);
    return existing.id;
  }

  const created = await repository.create({
    name,
    normalizedName,
    isDefault: true,
    createdByUserId: null,
  });

  titleIdCache.set(normalizedName, created.id);
  return created.id;
}

async function ensureCatalogCoverage(candidates: CandidateSeed[]): Promise<{
  uniqueSkills: number;
  uniqueTitles: number;
}> {
  const allSkills = new Set<string>();
  const allTitles = new Set<string>();

  for (const candidate of candidates) {
    for (const skill of candidate.skills) {
      allSkills.add(skill);
    }

    for (const title of candidate.titles) {
      allTitles.add(title);
    }
  }

  for (const skill of allSkills) {
    await ensureSkillId(skill);
  }

  for (const title of allTitles) {
    await ensureTitleId(title);
  }

  return {
    uniqueSkills: allSkills.size,
    uniqueTitles: allTitles.size,
  };
}

async function seedCandidate(
  candidate: CandidateSeed,
): Promise<{ resumeId: string; userId: string }> {
  const resumesRepository = resolve<IResumesRepository>(
    TOKENS.ResumesRepository,
  );
  const upsertResumeUseCase = resolve<UpsertMyResumeUseCase>(
    TOKENS.UpsertMyResumeUseCase,
  );
  const saveSkillsUseCase = resolve<SaveResumeSkillsBulkUseCase>(
    TOKENS.SaveResumeSkillsBulkUseCase,
  );
  const saveTitlesUseCase = resolve<SaveResumeTitlesBulkUseCase>(
    TOKENS.SaveResumeTitlesBulkUseCase,
  );
  const recordInteractionUseCase = resolve<RecordCandidateInteractionUseCase>(
    TOKENS.RecordCandidateInteractionUseCase,
  );

  const userId = await ensureUser(candidate);

  await upsertResumeUseCase.execute({
    userId,
    headlineTitle: candidate.headlineTitle,
    summary: candidate.summary,
    totalYearsExperience: candidate.totalYearsExperience,
    seniorityLevel: candidate.seniorityLevel,
    workModel: candidate.workModel,
    contractType: candidate.contractType,
    location: candidate.location,
    spokenLanguages: candidate.spokenLanguages,
    noticePeriod: candidate.noticePeriod,
    openToRelocation: candidate.openToRelocation,
    salaryExpectationMin: candidate.salaryExpectationMin,
    salaryExpectationMax: candidate.salaryExpectationMax,
  });

  const skillIds = await Promise.all(
    candidate.skills.map((name) => ensureSkillId(name)),
  );
  await saveSkillsUseCase.execute({
    userId,
    items: skillIds.map((skillId) => ({
      skillId,
      yearsExperience: randomInt(
        Math.max(1, candidate.totalYearsExperience - 4),
        candidate.totalYearsExperience,
      ),
    })),
  });

  const titleIds = await Promise.all(
    candidate.titles.map((name) => ensureTitleId(name)),
  );
  await saveTitlesUseCase.execute({
    userId,
    items: titleIds.map((titleId, rowIndex) => ({
      titleId,
      isPrimary: rowIndex === 0,
    })),
  });

  const resume = await resumesRepository.findByUserId(userId);

  if (!resume) {
    throw new Error(`Failed to resolve resume for user ${userId}`);
  }

  return {
    resumeId: resume.id,
    userId,
  };
}

function buildEmbeddingProcessor(): {
  processor: ProcessResumeEmbeddingJobUseCase;
  providerMode: "openai" | "deterministic";
} {
  const wantsOpenAi =
    process.env.SEED_REAL_USE_OPENAI?.trim().toLowerCase() === "true";
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (wantsOpenAi && hasOpenAi) {
    return {
      processor: resolve<ProcessResumeEmbeddingJobUseCase>(
        TOKENS.ProcessResumeEmbeddingJobUseCase,
      ),
      providerMode: "openai",
    };
  }

  const resumesRepository = resolve<IResumesRepository>(
    TOKENS.ResumesRepository,
  );
  const resumeSkillRepository = resolve<IResumeSkillRepository>(
    TOKENS.ResumeSkillRepository,
  );
  const resumeTitleRepository = resolve<IResumeTitleRepository>(
    TOKENS.ResumeTitleRepository,
  );
  const resumeEmbeddingsRepository = resolve<IResumeEmbeddingsRepository>(
    TOKENS.ResumeEmbeddingsRepository,
  );

  return {
    processor: new ProcessResumeEmbeddingJobUseCase(
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
      resumeEmbeddingsRepository,
      new DeterministicEmbeddingProvider(),
    ),
    providerMode: "deterministic",
  };
}

async function main(): Promise<void> {
  const candidateCount = parseCandidateCount();
  const candidates = buildCandidateSeeds(candidateCount);

  setupContainer();

  await seedDefaultCatalog();

  const catalogStats = await ensureCatalogCoverage(candidates);
  const recruiterId = await ensureUser(RECRUITER_SEED);

  const seededResumes: Array<{ resumeId: string; userId: string }> = [];

  for (const candidate of candidates) {
    const seeded = await seedCandidate(candidate);
    seededResumes.push(seeded);
  }

  const { processor, providerMode } = buildEmbeddingProcessor();

  for (const seededResume of seededResumes) {
    await processor.execute({
      resumeId: seededResume.resumeId,
      userId: seededResume.userId,
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });
  }

  console.log(
    `[seed-realistic] Done. recruiter=${recruiterId} resumes=${seededResumes.length} embeddings=${seededResumes.length} provider=${providerMode} uniqueSkills=${catalogStats.uniqueSkills} uniqueTitles=${catalogStats.uniqueTitles}`,
  );
}

main().catch((error) => {
  console.error("[seed-realistic] Failed", error);
  process.exit(1);
});
