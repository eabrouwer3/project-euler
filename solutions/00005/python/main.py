def is_divisible(n: int, by: int) -> bool:
    return n % by == 0

def is_divisible_by_all(n: int, by: list[int]) -> bool:
    return all(is_divisible(n, a) for a in by)

def counter(start, step):
    n = start
    while True:
        yield n
        n += step

if __name__ == '__main__':
    # If something is divisible by 20, then it's automatically divisible
    # by its factors (1, 2, 4, 5, 10), so we don't need to check anything
    # below 11. And because I'm stepping by 20 at a time, I can skip
    # checking that number
    nums_to_check = [19, 18, 17, 16, 15, 14, 13, 12, 11]
    for n in counter(20, 20):
        if is_divisible_by_all(n, nums_to_check):
            print(n)
            break
