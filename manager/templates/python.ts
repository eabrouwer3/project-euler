const MAIN_PY = `if __name__ == '__main__':
    print('Hello, World!')
`

function pyproject(problemNumber: number): string {
  return `[project]
name = "problem-${problemNumber}"
version = "0.1.0"
description = ""
authors = [
    {name = "Ethan Brouwer",email = "1647525+eabrouwer3@users.noreply.github.com"}
]
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
]


[build-system]
requires = ["poetry-core>=2.0.0,<3.0.0"]
build-backend = "poetry.core.masonry.api"
`
}

const README = `# Running This Python Solution

## Install Poetry/Python

<https://python-poetry.org/docs/#installation>

On Mac, just run

\`\`\`sh
brew install pipx
pipx ensurepath
pipx install poetry
\`\`\`

## Run Code

\`\`\`sh
poetry run python main.py
\`\`\`
`

export async function initializePythonSolution(problemNumber: number, dir: string) {
  const encoder = new TextEncoder()
  await Deno.writeFile(`${dir}/main.py`, encoder.encode(MAIN_PY))
  await Deno.writeFile(`${dir}/pyproject.toml`, encoder.encode(pyproject(problemNumber)))
  await Deno.writeFile(`${dir}/README.md`, encoder.encode(README))

  console.log(`Python solution initialized at ${dir}`)
}
