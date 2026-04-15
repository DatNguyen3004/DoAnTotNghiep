import sys
import os
from sqlalchemy import text

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine

def migrate():
    try:
        with engine.connect() as connection:
            print("Checking for avatar_url column...")
            # For SQL Server
            check_sql = text("""
                IF NOT EXISTS (
                    SELECT * FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[users]') 
                    AND name = 'avatar_url'
                )
                BEGIN
                    ALTER TABLE [dbo].[users] ADD [avatar_url] NVARCHAR(500) NULL;
                    PRINT 'Column avatar_url added.';
                END
                ELSE
                BEGIN
                    PRINT 'Column avatar_url already exists.';
                END
            """)
            connection.execute(check_sql)
            connection.commit()
            print("Migration successful.")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
