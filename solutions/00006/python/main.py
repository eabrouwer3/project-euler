if __name__ == '__main__':
    square = lambda n: n ** 2
    nums = range(1, 101)
    squares = map(square, nums)
    square_sum = sum(squares)
    num_sum = sum(nums)
    sum_squared = num_sum ** 2

    print(sum_squared - square_sum)
