import pymssql

conn = pymssql.connect(server='localhost', user='sa', password='12345678', autocommit=True)
cursor = conn.cursor()
cursor.execute("IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'nulabel') CREATE DATABASE nulabel")
print("Database 'nulabel' da san sang.")
conn.close()
