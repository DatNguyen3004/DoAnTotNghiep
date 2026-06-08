import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models.user
import models.project
import models.scene
import models.frame
import models.annotation
import models.task_submission
from routers.users import get_user_stats

db = SessionLocal()
try:
    res = get_user_stats(user_id=2, project_id=1, db=db)
    print("USER STATS RESPONSE FOR USER 2, PROJECT 1:")
    print(res)
except Exception as e:
    print("Error calling API:", e)
finally:
    db.close()
