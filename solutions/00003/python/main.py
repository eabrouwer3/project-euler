import math

def int_sqrt(n: int) -> int:
    return math.floor(math.sqrt(n))

def is_prime(n: int):
    if n % 2 == 0:
        return False
    for i in range(3, int_sqrt(n) + 1, 2):
        if n % i == 0:
            return False
    return True

INPUT = 600851475143
# INPUT = 13195

if __name__ == "__main__":
    for a in range(int_sqrt(INPUT) - 1, 3, -2):
        if INPUT % a == 0 and is_prime(a):
            print(a)
