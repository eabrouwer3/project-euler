# Project Euler

![](https://projecteuler.net/profile/IAmAlpaca.png)

I have another project with solutions (mostly in Python) that I last committed
to 7 years ago. I kind of wanted a fresh start, so I'm making a new repo to put
my solutions in.

I'm `IAmAlpaca` on Project Euler, so you can see what I've actually accomplished
there if you want.

## `solutions` Folder

- At the top-level is just a lot of folders with the problem number (prefixed by
  zeros for easy sorting).
- Inside each folder is a group of folders named the name of the language the
  solution is in (i.e. `python/`, `clojure/`, `rust/`, `c/`, etc.). Each
  solution has a `README.md` file with instructions for getting set up and
  running the solution file.
- Also inside each folder is a `.md` file with the whole problem text in it.

## `manager` Folder

A Deno project with an interactive "Manager" to initialize a solution folder
with everything to get started.

Install Deno with `brew install deno` and then run `deno run manager/main.ts` to
initialize a solution folder.
