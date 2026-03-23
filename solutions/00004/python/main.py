def is_palindrome(num: int) -> bool:
    return str(num) == str(num)[::-1]

if __name__ == '__main__':
    max_palindrome = -1
    for a in range(999, 100, -1):
        for b in range(a, 100, -1):
            if is_palindrome(a * b) and a * b > max_palindrome:
                max_palindrome = a * b
    print(max_palindrome)
