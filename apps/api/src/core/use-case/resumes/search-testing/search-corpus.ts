import { DeterministicEmbeddingProvider } from "../../../../infra/providers/deterministic-embedding-provider.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";

/**
 * A small, offline candidate corpus for search tests.
 *
 * Everything here is deterministic: candidate text is hashed into vectors by
 * `DeterministicEmbeddingProvider`, so tests never touch OpenAI, never vary
 * between machines, and never flake. The text is written to be *discriminating*
 * — five clearly separated role families with genuinely overlapping vocabulary
 * (a "full-stack" candidate legitimately shares words with both frontend and
 * backend) so a ranking test has something real to measure.
 */

/** 256 dims: enough to keep hashing collisions rare, small enough to be fast. */
export const searchTestEmbedder = new DeterministicEmbeddingProvider(256);

export interface CorpusCandidate {
  id: string;
  name: string;
  username: string;
  /** The text that stands in for a built resume document. */
  document: string;
  /** Per-source documents, for `sources`-scoped tests. */
  sources?: {
    profile?: string;
    work?: string;
    posts?: string;
  };
  headlineTitle: string;
  skills: string[];
  titles: string[];
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  location: string | null;
  noticePeriod: string | null;
  spokenLanguages: string[];
  totalYearsExperience: number | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  openToRelocation: boolean;
  openToWork?: boolean;
}

function candidate(
  id: string,
  overrides: Partial<CorpusCandidate> & Pick<CorpusCandidate, "document">,
): CorpusCandidate {
  return {
    id,
    name: overrides.name ?? id,
    username: overrides.username ?? id,
    headlineTitle: overrides.headlineTitle ?? id,
    skills: overrides.skills ?? [],
    titles: overrides.titles ?? [],
    seniorityLevel: overrides.seniorityLevel ?? "senior",
    workModel: overrides.workModel ?? "remote",
    contractType: overrides.contractType ?? "pj",
    location: overrides.location ?? "Sao Paulo",
    noticePeriod: overrides.noticePeriod ?? "Immediate",
    spokenLanguages: overrides.spokenLanguages ?? ["English"],
    totalYearsExperience: overrides.totalYearsExperience ?? 7,
    salaryExpectationMin: overrides.salaryExpectationMin ?? null,
    salaryExpectationMax: overrides.salaryExpectationMax ?? null,
    openToRelocation: overrides.openToRelocation ?? false,
    openToWork: overrides.openToWork,
    sources: overrides.sources,
    document: overrides.document,
  };
}

/**
 * Five role families, three or four candidates each, plus a handful of
 * deliberate edge cases (accented location, missing salary, closed to work).
 */
export const SEARCH_CORPUS: CorpusCandidate[] = [
  // --- React / Node full-stack ------------------------------------------
  candidate("fullstack-1", {
    name: "Ana Fullstack",
    headlineTitle: "Senior Full Stack Engineer",
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "GraphQL"],
    titles: ["Full Stack Engineer", "Software Engineer"],
    document:
      "skill: typescript react node.js postgresql graphql " +
      "title: full stack engineer software engineer " +
      "experience: full stack engineer building react frontends and node.js apis " +
      "summary: builds react single page applications backed by node.js rest and graphql services on postgresql",
    sources: {
      profile:
        "skill: typescript react node.js postgresql graphql title: full stack engineer",
      work: "experience: full stack engineer react node.js postgresql at a saas company",
      posts:
        "post: shipping a graphql gateway in node.js post_tags: graphql node.js typescript",
    },
  }),
  candidate("fullstack-2", {
    name: "Bruno Web",
    headlineTitle: "Full Stack Developer",
    skills: ["JavaScript", "React", "Node.js", "MongoDB"],
    titles: ["Full Stack Developer"],
    document:
      "skill: javascript react node.js mongodb " +
      "title: full stack developer " +
      "experience: full stack developer react node.js express mongodb " +
      "summary: javascript developer working across react components and node.js express services",
    sources: {
      profile: "skill: javascript react node.js mongodb title: full stack developer",
      work: "experience: full stack developer react node.js express mongodb",
    },
  }),
  candidate("frontend-1", {
    name: "Carla Front",
    headlineTitle: "Senior Frontend Engineer",
    skills: ["TypeScript", "React", "CSS", "Next.js"],
    titles: ["Frontend Engineer"],
    document:
      "skill: typescript react css next.js " +
      "title: frontend engineer " +
      "experience: frontend engineer building react and next.js interfaces " +
      "summary: designs accessible react component libraries and next.js applications",
    sources: {
      profile: "skill: typescript react css next.js title: frontend engineer",
      work: "experience: frontend engineer react next.js design systems",
    },
  }),
  candidate("backend-1", {
    name: "Diego Server",
    headlineTitle: "Senior Backend Engineer",
    skills: ["Node.js", "PostgreSQL", "Redis", "TypeScript"],
    titles: ["Backend Engineer"],
    document:
      "skill: node.js postgresql redis typescript " +
      "title: backend engineer " +
      "experience: backend engineer designing node.js services on postgresql and redis " +
      "summary: builds node.js rest apis, database schemas and caching layers",
    sources: {
      profile: "skill: node.js postgresql redis typescript title: backend engineer",
      work: "experience: backend engineer node.js postgresql redis apis",
      posts: "post: scaling postgresql connection pools post_tags: postgresql node.js",
    },
  }),

  // --- iOS / mobile -----------------------------------------------------
  candidate("mobile-1", {
    name: "Elena Mobile",
    headlineTitle: "Senior iOS Engineer",
    skills: ["Swift", "SwiftUI", "iOS", "Xcode"],
    titles: ["iOS Engineer", "Mobile Engineer"],
    document:
      "skill: swift swiftui ios xcode " +
      "title: ios engineer mobile engineer " +
      "experience: ios engineer shipping swift and swiftui applications to the app store " +
      "summary: native ios development with swift, swiftui and combine",
    sources: {
      profile: "skill: swift swiftui ios xcode title: ios engineer mobile engineer",
      work: "experience: ios engineer swift swiftui app store releases",
    },
  }),
  candidate("mobile-2", {
    name: "Felipe Android",
    headlineTitle: "Android Engineer",
    skills: ["Kotlin", "Android", "Jetpack Compose"],
    titles: ["Android Engineer", "Mobile Engineer"],
    document:
      "skill: kotlin android jetpack compose " +
      "title: android engineer mobile engineer " +
      "experience: android engineer building kotlin applications with jetpack compose " +
      "summary: native android development with kotlin and compose",
    sources: {
      profile: "skill: kotlin android jetpack compose title: android engineer",
      work: "experience: android engineer kotlin jetpack compose",
    },
  }),
  candidate("mobile-3", {
    name: "Gabriela Cross",
    headlineTitle: "React Native Engineer",
    skills: ["React Native", "TypeScript", "iOS", "Android"],
    titles: ["Mobile Engineer"],
    document:
      "skill: react native typescript ios android " +
      "title: mobile engineer " +
      "experience: mobile engineer shipping react native applications to ios and android " +
      "summary: cross platform mobile development with react native and typescript",
    sources: {
      profile: "skill: react native typescript ios android title: mobile engineer",
      work: "experience: mobile engineer react native ios android",
    },
  }),

  // --- Data engineering -------------------------------------------------
  candidate("data-1", {
    name: "Helena Pipeline",
    headlineTitle: "Senior Data Engineer",
    skills: ["Python", "Spark", "Airflow", "SQL"],
    titles: ["Data Engineer"],
    document:
      "skill: python spark airflow sql " +
      "title: data engineer " +
      "experience: data engineer building spark pipelines orchestrated with airflow " +
      "summary: batch and streaming data pipelines in python and spark on a warehouse",
    sources: {
      profile: "skill: python spark airflow sql title: data engineer",
      work: "experience: data engineer spark airflow warehouse pipelines",
      posts: "post: partitioning strategies for spark jobs post_tags: spark python",
    },
  }),
  candidate("data-2", {
    name: "Igor Warehouse",
    headlineTitle: "Analytics Engineer",
    skills: ["SQL", "dbt", "Snowflake", "Python"],
    titles: ["Analytics Engineer", "Data Engineer"],
    document:
      "skill: sql dbt snowflake python " +
      "title: analytics engineer data engineer " +
      "experience: analytics engineer modelling warehouse data with dbt on snowflake " +
      "summary: sql modelling, dbt transformations and warehouse quality testing",
    sources: {
      profile: "skill: sql dbt snowflake python title: analytics engineer",
      work: "experience: analytics engineer dbt snowflake sql modelling",
    },
  }),

  // --- Machine learning -------------------------------------------------
  candidate("ml-1", {
    name: "Julia Model",
    headlineTitle: "Machine Learning Engineer",
    skills: ["Python", "PyTorch", "MLOps", "Transformers"],
    titles: ["Machine Learning Engineer"],
    document:
      "skill: python pytorch mlops transformers " +
      "title: machine learning engineer " +
      "experience: machine learning engineer training transformer models in pytorch " +
      "summary: trains and serves deep learning models, embeddings and ranking systems",
    sources: {
      profile: "skill: python pytorch mlops transformers title: machine learning engineer",
      work: "experience: machine learning engineer pytorch transformers ranking",
      posts:
        "post: serving transformer embeddings behind a low latency api post_tags: pytorch mlops",
    },
  }),
  candidate("ml-2", {
    name: "Kaio Vision",
    headlineTitle: "Computer Vision Engineer",
    skills: ["Python", "TensorFlow", "OpenCV"],
    titles: ["Machine Learning Engineer", "Computer Vision Engineer"],
    document:
      "skill: python tensorflow opencv " +
      "title: machine learning engineer computer vision engineer " +
      "experience: computer vision engineer training convolutional models in tensorflow " +
      "summary: image classification, detection and segmentation with tensorflow and opencv",
    sources: {
      profile: "skill: python tensorflow opencv title: computer vision engineer",
      work: "experience: computer vision engineer tensorflow opencv detection",
    },
  }),

  // --- Infrastructure / SRE ---------------------------------------------
  candidate("devops-1", {
    name: "Lucas Cluster",
    headlineTitle: "Site Reliability Engineer",
    skills: ["Kubernetes", "Terraform", "AWS", "Go"],
    titles: ["Site Reliability Engineer", "DevOps Engineer"],
    document:
      "skill: kubernetes terraform aws go " +
      "title: site reliability engineer devops engineer " +
      "experience: site reliability engineer operating kubernetes clusters provisioned with terraform on aws " +
      "summary: infrastructure as code, kubernetes operations, observability and incident response",
    sources: {
      profile: "skill: kubernetes terraform aws go title: site reliability engineer",
      work: "experience: site reliability engineer kubernetes terraform aws observability",
      posts: "post: zero downtime kubernetes upgrades post_tags: kubernetes terraform",
    },
  }),
  candidate("devops-2", {
    name: "Mariana Deploy",
    headlineTitle: "DevOps Engineer",
    skills: ["Docker", "Kubernetes", "CI/CD", "AWS"],
    titles: ["DevOps Engineer"],
    document:
      "skill: docker kubernetes ci cd aws " +
      "title: devops engineer " +
      "experience: devops engineer building ci cd pipelines and docker kubernetes deployments on aws " +
      "summary: containerisation, deployment automation and cloud cost management",
    sources: {
      profile: "skill: docker kubernetes ci cd aws title: devops engineer",
      work: "experience: devops engineer docker kubernetes ci cd aws",
    },
  }),

  // --- Edge cases -------------------------------------------------------
  candidate("accented-location", {
    name: "Nina Acentos",
    headlineTitle: "Full Stack Engineer",
    skills: ["React", "Node.js"],
    titles: ["Full Stack Engineer"],
    // Typed their city with the accent, as a Brazilian candidate would.
    location: "São Paulo",
    spokenLanguages: ["Português", "English"],
    noticePeriod: "Imediato",
    document:
      "skill: react node.js title: full stack engineer " +
      "experience: full stack engineer react node.js " +
      "location: sao paulo",
    sources: {
      profile: "skill: react node.js title: full stack engineer",
    },
  }),
  candidate("no-salary", {
    name: "Otavio Flexible",
    headlineTitle: "Backend Engineer",
    skills: ["Node.js", "PostgreSQL"],
    titles: ["Backend Engineer"],
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    document:
      "skill: node.js postgresql title: backend engineer " +
      "experience: backend engineer node.js postgresql services",
    sources: {
      profile: "skill: node.js postgresql title: backend engineer",
    },
  }),
  candidate("not-looking", {
    name: "Paula Settled",
    headlineTitle: "Senior Full Stack Engineer",
    skills: ["TypeScript", "React", "Node.js"],
    titles: ["Full Stack Engineer"],
    openToWork: false,
    document:
      "skill: typescript react node.js title: full stack engineer " +
      "experience: full stack engineer react node.js typescript",
    sources: {
      profile: "skill: typescript react node.js title: full stack engineer",
    },
  }),
];

/**
 * Seeds a repository double with the corpus, embedding every document with the
 * deterministic provider so the vectors match what the query embedder produces.
 */
export function seedCorpus(
  repository: InMemoryResumeSearchRepository,
  candidates: CorpusCandidate[] = SEARCH_CORPUS,
): void {
  for (const item of candidates) {
    repository.seed({
      userId: item.id,
      resumeId: item.id,
      username: item.username,
      name: item.name,
      email: `${item.id}@example.com`,
      embedding: searchTestEmbedder.embed(item.document),
      sectionEmbeddings: item.sources
        ? {
            ...(item.sources.profile
              ? { profile: searchTestEmbedder.embed(item.sources.profile) }
              : {}),
            ...(item.sources.work
              ? { work: searchTestEmbedder.embed(item.sources.work) }
              : {}),
            ...(item.sources.posts
              ? { posts: searchTestEmbedder.embed(item.sources.posts) }
              : {}),
          }
        : undefined,
      headlineTitle: item.headlineTitle,
      summary: item.document,
      contractType: item.contractType,
      seniorityLevel: item.seniorityLevel,
      workModel: item.workModel,
      location: item.location,
      noticePeriod: item.noticePeriod,
      openToRelocation: item.openToRelocation,
      totalYearsExperience: item.totalYearsExperience,
      salaryExpectationMin: item.salaryExpectationMin,
      salaryExpectationMax: item.salaryExpectationMax,
      spokenLanguages: item.spokenLanguages,
      skills: item.skills,
      titles: item.titles,
      openToWork: item.openToWork,
    });
  }
}
