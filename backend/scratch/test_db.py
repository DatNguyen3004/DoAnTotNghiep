import sys
import os

# Add the current directory to sys.path so we can import from backend
sys.path.append(os.getcwd())

try:
    from database import engine
    with engine.connect() as connection:
        print("Successfully connected to the database.")
except Exception as e:
    print(f"Error connecting to the database: {e}")
