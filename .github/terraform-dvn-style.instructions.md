---
applyTo: "**/*.tf"
description: "Terraform coding conventions based on the dvn-workshop pattern. Use when writing or reviewing Terraform code: stacks, AWS provider, variables, IAM, EKS, ECR, VPC, remote backend, file naming."
---

# Terraform – dvn-workshop Coding Conventions

These conventions are extracted from the dvn-workshop-nov project and must be followed whenever writing or reviewing Terraform code.

---

## 1. Stack Structure

Organize infrastructure as **numbered, ordered stacks** where the number reflects the dependency order:

```
00-remote-backend-stack/   # Must be bootstrapped first — no remote backend itself
01-networking-stack/       # Depends on 00
02-cluster-eks-stack/      # Depends on 01
```

- Each stack is an independent Terraform root module (its own `terraform init`, `plan`, `apply`).
- Name stacks with a `NN-<purpose>-stack` pattern.

---

## 2. Required Files in Every Stack

Every stack **must** contain exactly these three files, always:

| File | Purpose |
|------|---------|
| `main.tf` | `terraform {}` block + `provider` block only |
| `variables.tf` | All input variable declarations |
| `outputs.tf` | All output value declarations (can be empty, but must exist) |

No resource definitions go into `main.tf`. Resources live in their own files.

---

## 3. File Naming Convention

Name files after the **resource type hierarchy**, using dots as separators:

```
vpc.tf                        # The VPC itself
vpc.internet-gateway.tf       # Internet Gateway for the VPC
vpc.nat-gateway.tf            # NAT Gateway for the VPC
vpc.eip.tf                    # Elastic IP for the NAT Gateway
vpc.public-subnets.tf         # Public subnets
vpc.private-subnets.tf        # Private subnets
vpc.public-route-table.tf     # Public route table + associations
vpc.private-route-table.tf    # Private route table + associations
eks.cluster.tf                # EKS cluster
eks.cluster.iam.tf            # IAM role for the EKS cluster
eks.cluster.node-group.tf     # EKS node group
eks.cluster.node-group.iam.tf # IAM role/attachments for the node group
ecr.repositories.tf           # ECR repositories
iam.identity-provider.github.tf # GitHub OIDC provider
iam.role.github.tf            # GitHub IAM role + policy
data.private-subnets.tf       # Data sources (prefix with data.)
```

Rules:
- Use **kebab-case** with **dots** as the hierarchy separator.
- One logical resource group per file.
- Data source files are prefixed with `data.`.

---

## 4. Resource Naming Inside Files

- Use `this` as the Terraform resource name when the file contains **one primary resource** of that type:
  ```hcl
  resource "aws_vpc" "this" { ... }
  resource "aws_s3_bucket" "this" { ... }
  ```
- Use a **descriptive name** when multiple resources of the same type exist in one file or when the name helps distinguish roles:
  ```hcl
  resource "aws_route_table" "public" { ... }
  resource "aws_route_table" "private" { ... }
  resource "aws_iam_role" "eks_cluster" { ... }
  resource "aws_iam_role" "eks_cluster_node_group" { ... }
  ```

---

## 5. `main.tf` — Provider & Backend Pattern

### AWS Provider (all stacks)
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.assume_role.region

  assume_role {
    role_arn = var.assume_role.arn
  }

  default_tags {
    tags = var.tags
  }
}
```

- Always use `assume_role` — never hard-code credentials.
- Always set `default_tags` on the provider with `var.tags`.
- Use `~> 6.0` (or latest minor-compatible) for the AWS provider version.

### Remote Backend (stacks 01+)
```hcl
backend "s3" {
  bucket       = "<project>-remote-backend-bucket"
  key          = "<stack-name>/terraform.tfstate"
  region       = "us-east-1"
  use_lockfile = true
}
```

- Use `use_lockfile = true` (native S3 locking, Terraform ≥ 1.10) instead of `dynamodb_table`.
- The `key` must be unique per stack (e.g., `networking/terraform.tfstate`, `eks/terraform.tfstate`).
- The bootstrap stack (`00-remote-backend-stack`) has **no** backend block — it uses local state.

---

## 6. Variables Pattern

### Always declare two base variables in every stack

```hcl
variable "tags" {
  type = map(string)
  default = {
    Environment = "production"
    Project     = "<your-project-name>"
  }
}

variable "assume_role" {
  type = object({
    arn    = string
    region = string
  })
  default = {
    arn    = "arn:aws:iam::<ACCOUNT_ID>:role/<role-name>"
    region = "us-east-1"
  }
}
```

### Group related config into a single `object` variable

Never create many flat variables for a resource. Group them into a typed `object`:

```hcl
variable "eks_cluster" {
  type = object({
    name                                   = string
    version                                = string
    enabled_cluster_log_types              = list(string)
    access_config_authentication_mode      = string
    node_group_name                        = string
    node_group_capacity_type               = string
    node_group_instance_types              = list(string)
    node_group_scaling_config_desired_size = number
    node_group_scaling_config_max_size     = number
    node_group_scaling_config_min_size     = number
  })

  default = {
    name                                   = "..."
    ...
  }
}
```

- Field names inside the object must be **fully descriptive** — avoid abbreviations.
- Always provide a `default` value so the stack is deployable without a `.tfvars` file.
- Use `list(object({...}))` for collections:
  ```hcl
  variable "ecr_repositories" {
    type = list(object({
      name                 = string
      image_tag_mutability = string
    }))
    default = [...]
  }
  ```

---

## 7. Iteration Pattern

Use `count` + `count.index` when iterating over a `list` variable:

```hcl
resource "aws_subnet" "public" {
  count = length(var.vpc.public_subnets)

  cidr_block        = var.vpc.public_subnets[count.index].cidr_block
  availability_zone = var.vpc.public_subnets[count.index].availability_zone
  ...
}
```

- Use `element(resource.name, 0).id` to safely reference the first item of a counted resource:
  ```hcl
  subnet_id = element(aws_subnet.public, 0).id
  ```

---

## 8. Tagging Pattern

Resources are tagged at **two levels**:

1. **Global tags** via `default_tags` on the provider (all resources inherit `Environment`, `Project`).
2. **Name tag** on each resource via the inline `tags` argument:
   ```hcl
   tags = { Name = var.vpc.internet_gateway_name }
   ```
   Or with the workspace prefix for environment differentiation:
   ```hcl
   tags = { Name = "${terraform.workspace}-${var.vpc.name}" }
   ```

Never repeat `Environment` or `Project` in per-resource `tags` — they come from `default_tags`.

---

## 9. IAM Conventions

### Pattern: Role + Attachments in the same file

Keep the IAM role and all its policy attachments in one file:

```hcl
# eks.cluster.iam.tf
resource "aws_iam_role" "eks_cluster" {
  name = "<project>-eks-cluster-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = ["sts:AssumeRole", "sts:TagSession"]
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}
```

- Use `jsonencode({})` for all inline policies — never raw JSON strings.
- Name policy attachments as `<role_resource_name>_<PolicyName>`.

### GitHub OIDC Role pattern

```hcl
# iam.identity-provider.github.tf
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# iam.role.github.tf
resource "aws_iam_role" "github" {
  name = "<project>-eks-github-role"
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Condition = {
        StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:<org>/<repo>:*" }
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
      }
    }]
    Version = "2012-10-17"
  })
}
```

---

## 10. Networking Conventions

### VPC layout

- One VPC per environment.
- Two public subnets across two AZs; two private subnets across two AZs.
- Suggested CIDR layout for a `/24` block:

  | Subnet | CIDR | AZ |
  |--------|------|----|
  | public-1a  | `10.x.x.0/26`   | us-east-1a |
  | public-1b  | `10.x.x.64/26`  | us-east-1b |
  | private-1a | `10.x.x.128/26` | us-east-1a |
  | private-1b | `10.x.x.192/26` | us-east-1b |

- One Internet Gateway for public subnets.
- One NAT Gateway (in the first public subnet) for private subnets.
- One Elastic IP for the NAT Gateway.
- Separate route tables for public (`0.0.0.0/0 → IGW`) and private (`0.0.0.0/0 → NAT GW`).

### Route table + associations in one file

```hcl
resource "aws_route_table" "public" { ... }

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

---

## 11. EKS Conventions

- EKS cluster reads subnets via **data source** (`data "aws_subnets"`) filtered by tags — **never** hard-code subnet IDs.
- Required cluster log types: `["api", "audit", "authenticator", "controllerManager", "scheduler"]`.
- Authentication mode: `"API_AND_CONFIG_MAP"`.
- Node group default: `ON_DEMAND`, `t3.medium`, desired/max/min = 2.
- Node group depends_on all three IAM policy attachments.

---

## 12. ECR Conventions

```hcl
resource "aws_ecr_repository" "this" {
  count                = length(var.ecr_repositories)
  name                 = var.ecr_repositories[count.index].name
  image_tag_mutability = var.ecr_repositories[count.index].image_tag_mutability
  force_delete         = true
}
```

- Always set `force_delete = true` to allow destroying non-empty repositories.
- Organize repository names as `<project>/<environment>/<service>` (e.g., `my-app/production/backend`).

---

## 13. Remote Backend Stack (00) Conventions

```hcl
# s3.bucket.tf
resource "aws_s3_bucket" "this" {
  bucket = var.remote_backend.bucket_name
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration { status = "Enabled" }
}

# dynamo.table.tf
resource "aws_dynamodb_table" "this" {
  name         = var.remote_backend.dynamo_table_name
  billing_mode = var.remote_backend.dynamo_table_billing_mode
  hash_key     = var.remote_backend.dynamo_table_hash_key
  attribute {
    name = var.remote_backend.dynamo_table_hash_key
    type = var.remote_backend.dynamo_table_hash_key_type
  }
}
```

- S3 versioning must always be enabled.
- DynamoDB table `billing_mode`: `PAY_PER_REQUEST`.
- Hash key: `LockID` (type `S`).

---

## Summary Checklist

When creating a new stack, verify:

- [ ] Folder named `NN-<purpose>-stack/`
- [ ] `main.tf` contains only `terraform {}` + `provider` blocks
- [ ] `variables.tf` declares `tags` and `assume_role` variables
- [ ] `outputs.tf` exists (even if empty)
- [ ] Resource files named using `<resource-type>.<sub-type>.tf` pattern
- [ ] AWS provider uses `assume_role` and `default_tags`
- [ ] S3 backend uses `use_lockfile = true`
- [ ] Complex config grouped into typed `object` variables
- [ ] Per-resource name tags use `{ Name = var.x.name }` or `"${terraform.workspace}-${var.x.name}"`
- [ ] IAM role and attachments co-located in the same file
- [ ] No hard-coded account IDs, credentials, or subnet IDs in resources
