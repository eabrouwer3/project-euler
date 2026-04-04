if __name__ == '__main__':
    all_nums = range(1, 101)
    summed_squares = sum(map(lambda x: x**2, all_nums))
    squared_sum = sum(all_nums)**2
    print(summed_squares)
    print(squared_sum)
    print(squared_sum - summed_squares)
