def is_divisible(n, x):
    return n % x == 0

DIVISORS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11]

if __name__ == '__main__':
    for n in range(2520, 99999999999, 2):
        if all(map(lambda x: is_divisible(n, x), DIVISORS)):
            print(n)
            break
