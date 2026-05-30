from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional

from database import get_db
from models.user import User
from models.task import Task
from models.chat_message import ChatMessage
from schemas.chat import ChatMessageCreate, ChatMessageOut, ChatUserOut
from routers.auth import get_current_user

router = APIRouter()

@router.get("/users", response_model=List[ChatUserOut])
def get_chat_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the list of users this user can privately message.
    - Admins can chat with everyone.
    - Non-admins can chat with all admins.
    - Non-admins can chat with users they share a task with (assigned <-> reviewer).
    """
    if current_user.role == "admin":
        users = db.query(User).filter(User.id != current_user.id, User.is_active == True).all()
        return users

    # Non-admins:
    # 1. All active admins
    admins = db.query(User).filter(User.role == "admin", User.is_active == True).all()
    
    # 2. Reviewers of tasks assigned to current_user
    reviewer_subquery = db.query(Task.reviewer_id).filter(
        Task.assigned_to == current_user.id,
        Task.reviewer_id.isnot(None)
    ).subquery()
    reviewers = db.query(User).filter(
        User.id.in_(reviewer_subquery),
        User.is_active == True
    ).all()
    
    # 3. Assignees of tasks reviewed by current_user
    assignee_subquery = db.query(Task.assigned_to).filter(
        Task.reviewer_id == current_user.id
    ).subquery()
    assignees = db.query(User).filter(
        User.id.in_(assignee_subquery),
        User.is_active == True
    ).all()
    
    # Combine lists and remove duplicates
    allowed_users = {}
    for u in (admins + reviewers + assignees):
        if u.id != current_user.id:
            allowed_users[u.id] = u
            
    return list(allowed_users.values())

@router.get("/messages", response_model=List[ChatMessageOut])
def get_chat_messages(
    recipient_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get chat messages.
    - If recipient_id is None: returns general group chat messages.
    - If recipient_id is provided: returns private messages between current_user and recipient_id.
    """
    if recipient_id is not None:
        # Check permissions
        is_allowed = False
        if current_user.role == "admin":
            is_allowed = True
        else:
            recipient = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
            if not recipient:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng nhận")
            if recipient.role == "admin":
                is_allowed = True
            else:
                connection_exists = db.query(Task).filter(
                    or_(
                        and_(Task.assigned_to == current_user.id, Task.reviewer_id == recipient_id),
                        and_(Task.reviewer_id == current_user.id, Task.assigned_to == recipient_id)
                    )
                ).first()
                if connection_exists:
                    is_allowed = True
                    
        if not is_allowed:
            raise HTTPException(status_code=403, detail="Không có quyền nhắn tin cho người dùng này")
            
        messages = db.query(ChatMessage).filter(
            or_(
                and_(ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id == recipient_id),
                and_(ChatMessage.sender_id == recipient_id, ChatMessage.recipient_id == current_user.id)
            )
        ).order_by(ChatMessage.created_at.asc()).all()
        
    else:
        # General group messages
        messages = db.query(ChatMessage).filter(
            ChatMessage.recipient_id.is_(None)
        ).order_by(ChatMessage.created_at.asc()).all()

    res = []
    for msg in messages:
        sender_user = msg.sender
        recipient_user = msg.recipient
        res.append(ChatMessageOut(
            id=msg.id,
            sender_id=msg.sender_id,
            sender_username=sender_user.username if sender_user else "N/A",
            sender_full_name=sender_user.full_name if sender_user else None,
            sender_role=sender_user.role if sender_user else "user",
            sender_avatar_url=sender_user.avatar_url if sender_user else None,
            recipient_id=msg.recipient_id,
            recipient_username=recipient_user.username if recipient_user else None,
            message=msg.message,
            created_at=msg.created_at
        ))
    return res

@router.post("/messages", response_model=ChatMessageOut)
def send_chat_message(
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a message (general or direct).
    """
    recipient_id = body.recipient_id
    if recipient_id is not None:
        # Check permissions
        is_allowed = False
        if current_user.role == "admin":
            is_allowed = True
        else:
            recipient = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
            if not recipient:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng nhận")
            if recipient.role == "admin":
                is_allowed = True
            else:
                connection_exists = db.query(Task).filter(
                    or_(
                        and_(Task.assigned_to == current_user.id, Task.reviewer_id == recipient_id),
                        and_(Task.reviewer_id == current_user.id, Task.assigned_to == recipient_id)
                    )
                ).first()
                if connection_exists:
                    is_allowed = True
                    
        if not is_allowed:
            raise HTTPException(status_code=403, detail="Không có quyền nhắn tin cho người dùng này")
            
    db_msg = ChatMessage(
        sender_id=current_user.id,
        recipient_id=recipient_id,
        message=body.message
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    
    sender_user = db_msg.sender
    recipient_user = db_msg.recipient
    
    return ChatMessageOut(
        id=db_msg.id,
        sender_id=db_msg.sender_id,
        sender_username=sender_user.username if sender_user else "N/A",
        sender_full_name=sender_user.full_name if sender_user else None,
        sender_role=sender_user.role if sender_user else "user",
        sender_avatar_url=sender_user.avatar_url if sender_user else None,
        recipient_id=db_msg.recipient_id,
        recipient_username=recipient_user.username if recipient_user else None,
        message=db_msg.message,
        created_at=db_msg.created_at
    )
